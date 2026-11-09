#!/usr/bin/env python3
"""Thin CLI over the test-forge-driver command queue, so a big result can land in a file instead of context.

  qa.py cmd '<json>'                 post one command, print its result JSON
  qa.py tree [identifier] [type]     dump the tree to tree.txt, print line count
  qa.py grep <regex>                 grep the last dump
  qa.py reload <url> <id> [button]   relaunch + deeplink + optional alert tap + wait for <id>
"""
import json, os, re, subprocess, sys, time, urllib.request, pathlib

BASE = "http://127.0.0.1:8789"
# Never beside the script: that is inside the repo, and a tree dump is scratch, not a deliverable.
DUMP = pathlib.Path(os.environ.get("TEST_FORGE_SCRATCH", os.environ.get("TMPDIR", "/tmp"))) / "test-forge-tree.txt"


def post_once(command, timeout=180):
    data = json.dumps(command).encode()
    request = urllib.request.Request(BASE + "/command", data=data, headers={"content-type": "application/json"})
    identifier = json.load(urllib.request.urlopen(request))["id"]
    deadline = time.time() + timeout
    while time.time() < deadline:
        payload = json.load(urllib.request.urlopen(f"{BASE}/result?id={identifier}"))
        if not payload.get("pending"):
            return payload["result"]
        time.sleep(0.4)
    return {"error": f"timeout waiting for {command.get('kind')}"}


def post(command, timeout=180, recover=True):
    """One command, with a single harness restart if the session died under it.

    An XCTest raise inside a handler unwinds `testLiveSession`, so the command that killed the
    harness and every command after it simply never return. Restarting and re-sending once turns
    that from the end of a run into a recorded heal — but only once: a command that kills the
    harness twice will kill it every time, and the honest outcome is a blocked case, not a loop.
    """
    result = post_once(command, timeout)
    # Only a *client-side* timeout means the session stopped collecting. An error the harness itself
    # returned ("no element 'X' after 10s") is a real answer to a real question — restarting on one
    # costs two minutes and tells you nothing you did not already know.
    timed_out = isinstance(result, dict) and str(result.get("error", "")).startswith("timeout waiting for")
    if not recover or not timed_out:
        return result
    supervisor = pathlib.Path(__file__).with_name("harness.py")
    print(f"  ! {command.get('kind')} did not return; restarting the harness", file=sys.stderr)
    restarted = subprocess.run([sys.executable, str(supervisor), "ensure"], capture_output=True, text=True)
    print(restarted.stdout.strip(), file=sys.stderr)
    if restarted.returncode != 0:
        return {"error": "harness down and could not be restarted", "detail": restarted.stdout[-400:]}
    retried = post_once(command, timeout)
    if isinstance(retried, dict) and retried.get("error"):
        retried["note"] = "failed again after a harness restart — this command is what kills the session"
    else:
        retried = dict(retried or {})
        retried["harnessRestarted"] = True
    return retried


def reload_screen(url, identifier, alert_button=None):
    """Relaunch, deeplink in, and wait for the screen to actually be there.

    `alert_button` is for a screen that comes up behind a chooser or permission alert; screens that
    do not are left alone rather than spending ten seconds looking for an alert that never appears.
    """
    print("relaunch:", json.dumps(post({"kind": "relaunchApp"}, timeout=240))[:120])
    subprocess.run(["xcrun", "simctl", "openurl", "booted", url], check=False)
    time.sleep(2)
    if alert_button:
        for _ in range(10):
            result = post({"kind": "alertTap", "buttonTitle": alert_button})
            if result.get("found"):
                break
            time.sleep(1)
        else:
            print(f"alert button {alert_button!r} never appeared")
    print("screen:", json.dumps(post({"kind": "waitForExists", "identifier": identifier, "timeout": 30})))


def main():
    action = sys.argv[1]
    if action == "cmd":
        print(json.dumps(post(json.loads(sys.argv[2])))[:4000])
    elif action == "tree":
        command = {"kind": "dumpTree"}
        if len(sys.argv) > 2 and sys.argv[2] != "-":
            command["identifier"] = sys.argv[2]
        if len(sys.argv) > 3:
            command["elementType"] = sys.argv[3]
        result = post(command)
        text = (result or {}).get("tree", json.dumps(result))
        DUMP.write_text(text.replace("\\n", "\n"))
        print(f"{len(DUMP.read_text().splitlines())} lines -> {DUMP} truncated={result.get('truncated')}")
    elif action == "grep":
        pattern = re.compile(sys.argv[2])
        for line in DUMP.read_text().splitlines():
            if pattern.search(line):
                print(line.strip())
    elif action == "reload":
        if len(sys.argv) < 4:
            raise SystemExit("reload needs a url and the identifier that proves the screen is up:\n"
                             "  qa.py reload 'https://<host>/<path>' Screen_RootContainer [AlertButton]")
        reload_screen(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else None)
    else:
        print(__doc__)


# Guarded so `post()` stays importable: it is the one command seam that carries a harness restart,
# and `scan_mode.py` drives the queue through it rather than opening a second path to the same port.
if __name__ == "__main__":
    main()
