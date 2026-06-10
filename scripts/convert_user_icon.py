from PIL import Image
import os

def convert_icon():
    source_path = "extension/icons/icon.png"
    if not os.path.exists(source_path):
        print(f"Error: {source_path} does not exist!")
        return

    sizes = [16, 48, 128]
    img = Image.open(source_path)
    
    # Ensure image has alpha channel (RGBA)
    if img.mode != 'RGBA':
        img = img.convert('RGBA')

    for size in sizes:
        # Resize using high-quality Lanczos resampling
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        
        # Save active (color) version
        active_path = f"extension/icons/icon{size}.png"
        resized.save(active_path, "PNG")
        print(f"Saved active icon: {active_path}")

        # Create grayscale version while preserving alpha channel
        r, g, b, a = resized.split()
        # Convert RGB to grayscale (luminance)
        rgb_gray = Image.merge("RGB", (r, g, b)).convert("L")
        # Merge back to RGBA
        gray_resized = Image.merge("RGBA", (rgb_gray, rgb_gray, rgb_gray, a))
        
        # Optional: Slightly decrease opacity or brightness for inactive look
        # (We can modify the alpha channel if needed, but standard grayscale is usually best)
        
        # Save inactive (gray) version
        inactive_path = f"extension/icons/icon{size}_gray.png"
        gray_resized.save(inactive_path, "PNG")
        print(f"Saved inactive icon: {inactive_path}")

if __name__ == "__main__":
    convert_icon()
