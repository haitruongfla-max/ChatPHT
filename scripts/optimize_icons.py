from pathlib import Path
from PIL import Image

source = Path("/home/ubuntu/webdev-static-assets/swiftchat-icon.png")
destinations = {
    "icon.png": 1024,
    "splash-icon.png": 1024,
    "android-icon-foreground.png": 1024,
    "favicon.png": 256,
}
target_dir = Path("/home/ubuntu/swift-chat/assets/images")

with Image.open(source) as original:
    rgb = original.convert("RGB")
    for filename, size in destinations.items():
        resized = rgb.resize((size, size), Image.Resampling.LANCZOS)
        optimized = resized.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
        optimized.save(target_dir / filename, format="PNG", optimize=True, compress_level=9)
