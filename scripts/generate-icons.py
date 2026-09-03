"""Generate app icons from the Lagos Live logo."""
from PIL import Image, ImageDraw
import os

SRC = r"public\Lagos Live Skyline Bridge Logo.png"
OUT = "public"

# Brand colors
DARK_BG = (7, 7, 11)  # #07070B
PINK = (255, 45, 149)  # #FF2D95
PURPLE = (138, 43, 226)  # #8A2BE2

def create_icon(src_path, size, output_path, padding_pct=0.22):
    """Create a square app icon with dark bg and centered logo."""
    logo = Image.open(src_path).convert("RGBA")
    
    # Create square canvas with dark background
    canvas = Image.new("RGBA", (size, size), DARK_BG + (255,))
    
    # Calculate logo size with padding
    max_logo_dim = int(size * (1 - 2 * padding_pct))
    logo.thumbnail((max_logo_dim, max_logo_dim), Image.LANCZOS)
    
    # Center the logo
    x = (size - logo.width) // 2
    y = (size - logo.height) // 2
    canvas.paste(logo, (x, y), logo)
    
    # Save as PNG
    canvas.save(output_path, "PNG")
    print(f"Created: {output_path} ({size}x{size})")

def create_favicon(src_path, output_path):
    """Create a 32x32 favicon."""
    logo = Image.open(src_path).convert("RGBA")
    
    canvas = Image.new("RGBA", (32, 32), DARK_BG + (255,))
    logo.thumbnail((24, 24), Image.LANCZOS)
    x = (32 - logo.width) // 2
    y = (32 - logo.height) // 2
    canvas.paste(logo, (x, y), logo)
    
    # Save as ICO
    canvas.save(output_path, format="ICO", sizes=[(32, 32)])
    print(f"Created: {output_path} (favicon)")

def create_apple_touch_icon(src_path, output_path):
    """Create 180x180 Apple touch icon with rounded corners."""
    logo = Image.open(src_path).convert("RGBA")
    
    size = 180
    canvas = Image.new("RGBA", (size, size), DARK_BG + (255,))
    
    max_logo_dim = int(size * 0.76)
    logo.thumbnail((max_logo_dim, max_logo_dim), Image.LANCZOS)
    
    x = (size - logo.width) // 2
    y = (size - logo.height) // 2
    canvas.paste(logo, (x, y), logo)
    
    # Apply rounded corners (iOS style)
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    radius = int(size * 0.22)  # ~22% corner radius like iOS
    draw.rounded_rectangle([(0, 0), (size, size)], radius=radius, fill=255)
    
    canvas.putalpha(mask)
    canvas.save(output_path, "PNG")
    print(f"Created: {output_path} ({size}x{size})")

# Generate all icons
create_icon(SRC, 192, os.path.join(OUT, "icon-192.png"))
create_icon(SRC, 512, os.path.join(OUT, "icon-512.png"))
create_apple_touch_icon(SRC, os.path.join(OUT, "apple-touch-icon.png"))
create_favicon(SRC, os.path.join(OUT, "favicon.ico"))

# Also generate apple-touch-icon-180x180 for explicit size
create_apple_touch_icon(SRC, os.path.join(OUT, "apple-touch-icon-180x180.png"))

print("\nAll icons generated successfully!")
