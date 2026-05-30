# MP4 / MOV to WebP

A free, open-source static web app that converts short MP4 or MOV videos into animated WebP files directly in the user's browser.

## Features

- Runs entirely on the user's machine through WebAssembly.
- No video upload and no conversion server.
- Adjustable FPS and WebP quality.
- Optional automatic downscaling for videos wider than 1000px.
- English UI by default, with a Chinese language switch.
- Works as a static site on GitHub Pages or any ordinary web host.

## Use

Open `index.html` through a local/static web server, choose an MP4 or MOV file, adjust the settings, and download the generated `.webp` file.

For local preview:

```bash
python -m http.server 5179
```

Then open:

```text
http://127.0.0.1:5179/
```

## Privacy

The selected video file stays in the browser. This app does not upload videos to a backend server.

## Notes

Large or long videos can be slow because conversion uses the user's CPU and browser memory. Short clips under 15 seconds are recommended.

## License

GPL-2.0-or-later. See `LICENSE` and `THIRD_PARTY_NOTICES.txt`.

Developer: 缪熙
