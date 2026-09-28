# Photoshop compatibility harness

This is a local-only fixture runner. It generates controlled PSDs in Photoshop, imports and exports each through Visteras, then reopens the exported files in Photoshop for structure and rendered-pixel inspection.

```sh
python3 apps/studio/tests/photoshop/suite.py prepare --run /tmp/visteras-psd-run
python3 apps/studio/tests/photoshop/suite.py serve --run /tmp/visteras-psd-run --port 8771
```

In Photoshop, run `generate.jsx` through **File → Scripts → Browse…**. Open `http://127.0.0.1:8771/runner` and click **Run Visteras round-trip**. Then run `inspect.jsx` in Photoshop and finish with:

```sh
python3 apps/studio/tests/photoshop/suite.py report --run /tmp/visteras-psd-run
```

The run uses generated fixtures only and rejects uploads without a run token. `PASS` requires structure equality and a strict pixel threshold over black and white backgrounds. `REVIEW` means a difference was detected; it is not automatically accepted as a known limitation.
