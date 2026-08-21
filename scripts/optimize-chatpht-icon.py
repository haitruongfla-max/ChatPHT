from pathlib import Path

from PIL import Image


SOURCE = Path("/home/ubuntu/webdev-static-assets/chatpht-icon.png")
DESTINATIONS = [
    Path("/home/ubuntu/swift-chat/assets/images/icon.png"),
    Path("/home/ubuntu/swift-chat/assets/images/splash-icon.png"),
    Path("/home/ubuntu/swift-chat/assets/images/favicon.png"),
    Path("/home/ubuntu/swift-chat/assets/images/android-icon-foreground.png"),
]


def main() -> None:
    with Image.open(SOURCE) as source:
        image = source.convert("RGBA")
        image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        for destination in DESTINATIONS:
            image.save(destination, format="PNG", optimize=True, compress_level=9)
            print(f"{destination.name}: {destination.stat().st_size} bytes")


if __name__ == "__main__":
    main()
