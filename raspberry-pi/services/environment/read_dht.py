#!/usr/bin/env python3
"""
GreenMirror DHT reader helper.

Reads a DHT11/DHT22 once and prints a single JSON line to stdout:
    {"temperature_c": 21.4, "humidity_pct": 55.0}
or, on failure:
    {"error": "<message>"}

DHT timing is too strict for reliable pure-Node reads, so the Node
environment-service spawns this helper. Kept tiny and sensor-agnostic so DHT11
can be swapped for DHT22 without touching Node.

Requires ONE of (installed on the Raspberry Pi):
  - adafruit-circuitpython-dht  (preferred; libgpiod-based, works on Bookworm)
  - Adafruit_DHT               (legacy fallback)

Usage:
    python3 read_dht.py --gpio 4 --type dht11
"""

import sys
import json
import time
import argparse


def read_circuitpython(gpio, sensor):
    """Preferred path: adafruit-circuitpython-dht."""
    import board
    import adafruit_dht

    pin = getattr(board, "D%d" % gpio)
    device = adafruit_dht.DHT22(pin) if sensor == "dht22" else adafruit_dht.DHT11(pin)
    try:
        last_err = None
        # DHT sensors routinely fail a read with a transient RuntimeError; retry.
        for _ in range(4):
            try:
                temp = device.temperature
                hum = device.humidity
                if temp is not None and hum is not None:
                    return float(temp), float(hum)
            except RuntimeError as exc:
                last_err = str(exc)
            time.sleep(2)
        raise RuntimeError(last_err or "no valid reading")
    finally:
        try:
            device.exit()
        except Exception:
            pass


def read_legacy(gpio, sensor):
    """Fallback path: legacy Adafruit_DHT."""
    import Adafruit_DHT

    model = Adafruit_DHT.DHT22 if sensor == "dht22" else Adafruit_DHT.DHT11
    hum, temp = Adafruit_DHT.read_retry(model, gpio, retries=4, delay_seconds=2)
    if temp is None or hum is None:
        raise RuntimeError("no valid reading")
    return float(temp), float(hum)


def main():
    parser = argparse.ArgumentParser(description="Read a DHT11/DHT22 sensor.")
    parser.add_argument("--gpio", type=int, default=4, help="BCM GPIO number (default 4)")
    parser.add_argument("--type", default="dht11", help="dht11 | dht22")
    args = parser.parse_args()
    sensor = args.type.lower()

    try:
        try:
            temp_c, hum = read_circuitpython(args.gpio, sensor)
        except ImportError:
            temp_c, hum = read_legacy(args.gpio, sensor)
        print(json.dumps({"temperature_c": round(temp_c, 1), "humidity_pct": round(hum, 1)}))
        return 0
    except Exception as exc:  # noqa: BLE001 — any failure becomes a JSON error line
        print(json.dumps({"error": str(exc)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
