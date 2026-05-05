# GreenMirror

GreenMirror is a modular greenhouse monitoring and automation system.

## Architecture

- ESP32 nodes: collect soil data (moisture, temperature)
- Raspberry Pi: local hub (data processing, plant logic, API)
- Dashboard: user interface for monitoring and control

## Structure

- `esp-firmware/` → ESP32 code
- `raspberry-pi/` → backend + data processing
- `dashboard/` → web/mobile interface
- `docs/` → system design and notes