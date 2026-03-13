# Furhat DOA 3D Visualization

This project is a browser-based interface for visualizing sound source direction from a DOA (Direction of Arrival) pipeline. It connects to a WebSocket server, receives real-time direction data, and renders the result as interactive 3D visuals with Three.js.

The main purpose of the project is to bridge two parts of the system:

- a DOA estimation backend that produces direction data
- a frontend visualization layer that makes the direction and volume easier to inspect

The interface was designed for fast testing and demo use. It shows connection status, the latest incoming DOA payload, visualization mode switching, and style controls for selected modes.

## What the project does

The webpage listens for DOA data from a WebSocket server and updates a 3D visualization in real time. The current interface supports four rendering modes:

- `faces`: a filled orb with wire overlay and directional deformation
- `wireframe`: a lighter mesh-based orb view
- `arrow`: a directional arrow representation
- `furhat`: a Furhat model that reacts to DOA direction and volume

The frontend accepts DOA messages containing direction and optional volume. Direction is normalized before rendering, while volume is used as the response magnitude for the visual effect.

Accepted payload shapes:

```json
{
  "dir": {
    "x": 0.82,
    "y": 0.05,
    "z": 0.56
  },
  "volume": 180.4
}
```

or

```json
{
  "x": 0.82,
  "y": 0.05,
  "z": 0.56,
  "volume": 180.4
}
```

For backward compatibility, the frontend also accepts `strength`, but the current visualization pipeline is intended to use `volume`.

## Project structure

- `index.html`: main page layout and UI
- `app.js`: WebSocket connection, payload parsing, UI interaction
- `sceneSetup.js`: shared Three.js scene, camera, lighting, and speaker model setup
- `doaController.js`: smoothing and stale-data fallback logic
- `faces.js`: faces orb renderer
- `wireframe.js`: wireframe orb renderer
- `arrow.js`: arrow renderer
- `furhat.js`: Furhat model renderer
- `mock-ws-server.js`: local mock WebSocket server for frontend testing

## How to run

This project does not require a frontend build step. It only needs a static file server and, optionally, a WebSocket data source.

### 1. Start a static server

From the project root:

```bash
cd <repo-root>
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

### 2. Connect to a DOA WebSocket source

By default, the page connects to:

```text
ws://192.168.1.217:8765
```

If your DOA server is running at a different address, you can override it through the URL:

```text
http://localhost:8080/?ws=ws://localhost:9000
```

### 3. Choose a visualization mode

You can switch modes from the UI or by URL:

```text
http://localhost:8080/?orbStyle=faces
http://localhost:8080/?orbStyle=wireframe
http://localhost:8080/?orbStyle=arrow
http://localhost:8080/?orbStyle=furhat
```

You can also combine both parameters:

```text
http://localhost:8080/?orbStyle=faces&ws=ws://localhost:9000
```

## Local mock testing

If you want to test the frontend without the real DOA backend, run:

```bash
cd <repo-root>
npm run mock
```

This starts a mock WebSocket server at:

```text
ws://localhost:9000
```

Then open:

```text
http://localhost:8080/?ws=ws://localhost:9000
```

Note: the current mock server is mainly intended to validate WebSocket connectivity and frontend updates. The real backend is still the correct source for testing the full `volume`-driven visual response.

## Reproducing the full demo

To reproduce the intended workflow:

1. Start the real DOA backend so it exposes a WebSocket endpoint.
2. Start the static server for this repository.
3. Open the webpage and confirm that the left panel shows `Connected`.
4. Verify that the latest payload is updating with `x`, `y`, `z`, and `volume`.
5. Switch between visualization modes to inspect how the same DOA data is represented.

## Interface features

The current interface includes:

- live WebSocket connection status
- latest raw DOA payload display
- mode switching between four visualization styles
- style customization for `faces`, `wireframe`, and `arrow`
- a left-right layout that keeps the control panel separate from the main 3D visualization

## Current limitations

- the project currently depends on a running DOA WebSocket server for full real-time testing
- the mock server is lightweight and does not fully represent the real backend behavior
- the exact visual response depends on the scale of the incoming `volume` values
- there is no build, lint, or automated test pipeline yet

## Authors and context

This repository is part of a sound localization visualization project using a four-microphone array and a 3D web interface. The frontend is responsible for receiving DOA output and presenting it as interactive visual feedback for testing, demonstration, and analysis.
