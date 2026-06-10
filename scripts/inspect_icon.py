from PIL import Image
import numpy as np

def inspect():
    img = Image.open("extension/icons/icon.png")
    print(f"Dimensions: {img.size}")
    print(f"Mode: {img.mode}")
    
    # Convert to RGBA to inspect channels
    img_rgba = img.convert("RGBA")
    w, h = img_rgba.size
    
    # Check corners
    corners = {
        "top-left (0,0)": img_rgba.getpixel((0, 0)),
        "top-right (w-1,0)": img_rgba.getpixel((w - 1, 0)),
        "bottom-left (0,h-1)": img_rgba.getpixel((0, h - 1)),
        "bottom-right (w-1,h-1)": img_rgba.getpixel((w - 1, h - 1))
    }
    print("\nCorner pixels (R, G, B, A):")
    for name, val in corners.items():
        print(f"  {name}: {val}")
        
    # Check a sample of pixels around the outer border (top row, bottom row, left col, right col)
    # Convert to numpy array for quick statistics
    arr = np.array(img_rgba)
    
    # Check average colors of outer rows/cols
    top_row = arr[0, :, :]
    bottom_row = arr[-1, :, :]
    left_col = arr[:, 0, :]
    right_col = arr[:, -1, :]
    
    print("\nOuter edges statistics:")
    print(f"  Top row alpha avg: {top_row[:, 3].mean():.1f}, color avg: {top_row[:, :3].mean(axis=0)}")
    print(f"  Bottom row alpha avg: {bottom_row[:, 3].mean():.1f}, color avg: {bottom_row[:, :3].mean(axis=0)}")
    print(f"  Left col alpha avg: {left_col[:, 3].mean():.1f}, color avg: {left_col[:, :3].mean(axis=0)}")
    print(f"  Right col alpha avg: {right_col[:, 3].mean():.1f}, color avg: {right_col[:, :3].mean(axis=0)}")

if __name__ == "__main__":
    inspect()
