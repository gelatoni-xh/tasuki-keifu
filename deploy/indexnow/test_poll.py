import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location("indexnow_poll", Path(__file__).with_name("poll.py"))
poll = importlib.util.module_from_spec(spec)
spec.loader.exec_module(poll)


class PollTests(unittest.TestCase):
    def test_no_database_writes_skips_sitemaps_and_submission(self):
        with tempfile.TemporaryDirectory() as directory:
            state_dir = Path(directory)
            signature = [1, None, "start", 10, 20, 30]
            poll.save_state(state_dir / "state.json", {})
            poll.save_json(state_dir / "db-signature.json", signature)
            with patch.object(poll, "database_signature", return_value=signature), patch.object(poll, "read_sitemaps") as read, patch.object(poll, "fetch") as fetch:
                poll.poll_once("http://localhost", state_dir)
                read.assert_not_called()
                fetch.assert_not_called()

    def test_failed_submission_does_not_advance_database_cursor(self):
        with tempfile.TemporaryDirectory() as directory:
            state_dir = Path(directory)
            old = [1, None, "start", 10, 20, 30]
            new = [1, None, "start", 11, 20, 30]
            poll.save_json(state_dir / "db-signature.json", old)
            with patch.object(poll, "database_signature", return_value=new), patch.object(poll, "read_sitemaps", return_value={poll.SITE + "/ja": "new"}), patch.object(poll, "fetch", side_effect=OSError("offline")):
                with self.assertRaises(OSError):
                    poll.poll_once("http://localhost", state_dir)
                self.assertEqual(poll.json.loads((state_dir / "db-signature.json").read_text()), old)
            with patch.object(poll, "database_signature", return_value=new), patch.object(poll, "read_sitemaps", return_value={poll.SITE + "/ja": "new"}) as read, patch.object(poll, "fetch", return_value=(200, b"")):
                poll.poll_once("http://localhost", state_dir)
                read.assert_called_once()
                self.assertEqual(poll.json.loads((state_dir / "db-signature.json").read_text()), new)

    def test_restart_or_counter_reset_forces_scan(self):
        with tempfile.TemporaryDirectory() as directory:
            state_dir = Path(directory)
            old = [1, None, "old-start", 10, 20, 30]
            new = [1, None, "new-start", 10, 20, 30]
            poll.save_state(state_dir / "state.json", {})
            poll.save_json(state_dir / "db-signature.json", old)
            with patch.object(poll, "database_signature", return_value=new), patch.object(poll, "read_sitemaps", return_value={}) as read:
                poll.poll_once("http://localhost", state_dir)
                read.assert_called_once()

    def test_changed_and_new_only_then_no_repeat(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / "state.json"
            urls = {poll.SITE + "/ja/players/a": "old", poll.SITE + "/ja/players/b": "new"}
            acknowledged = {poll.SITE + "/ja/players/a": "old"}
            with patch.object(poll, "fetch", return_value=(202, b"")) as fetch:
                poll.submit_changes(urls, acknowledged, state)
                self.assertEqual(fetch.call_args.args[1]["urlList"], [poll.SITE + "/ja/players/b"])
                poll.submit_changes(urls, poll.load_state(state), state)
                self.assertEqual(fetch.call_count, 1)
            urls[poll.SITE + "/ja/players/a"] = "changed"
            with patch.object(poll, "fetch", return_value=(200, b"")) as fetch:
                poll.submit_changes(urls, poll.load_state(state), state)
                self.assertEqual(fetch.call_args.args[1]["urlList"], [poll.SITE + "/ja/players/a"])

    def test_partial_failure_retries_only_unaccepted_batch(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / "state.json"
            urls = {poll.SITE + f"/ja/players/{i:04d}": "new" for i in range(501)}
            error = HTTPError(poll.ENDPOINT, 429, "Too many requests", {}, None)
            with patch.object(poll, "fetch", side_effect=[(200, b""), error]):
                with self.assertRaises(HTTPError):
                    poll.submit_changes(urls, {}, state)
            self.assertEqual(len(poll.load_state(state)), 500)
            with patch.object(poll, "fetch", return_value=(200, b"")) as fetch:
                poll.submit_changes(urls, poll.load_state(state), state)
                self.assertEqual(len(fetch.call_args.args[1]["urlList"]), 1)
            self.assertEqual(poll.load_state(state), urls)

    def test_empty_invalid_or_external_sitemap_fails(self):
        for body in [b'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>', b'broken',
                     b'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://evil.test/ja</loc><lastmod>2026-11-07</lastmod></url></urlset>']:
            with self.subTest(body=body), patch.object(poll, "fetch", return_value=(200, body)):
                with self.assertRaises((ValueError, poll.ET.ParseError)):
                    poll.read_sitemaps("http://localhost")

    def test_corrupt_state_does_not_reset(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            path.write_text('{"version":2,"urls":{}}')
            with self.assertRaises(ValueError):
                poll.load_state(path)

    def test_dry_run_does_not_submit_or_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / "state.json"
            with patch.object(poll, "fetch") as fetch:
                poll.submit_changes({poll.SITE + "/ja": "new"}, {}, state, True)
                fetch.assert_not_called()
                self.assertFalse(state.exists())


if __name__ == "__main__":
    unittest.main()
