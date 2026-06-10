from PIL import Image
import os

def remove_white_background(img_path, tolerance=15):
    img = Image.open(img_path)
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
        
    width, height = img.size
    pixels = img.load()
    
    # Create a mask: 255 (opaque), 0 (transparent)
    mask = Image.new("L", (width, height), 255)
    mask_pixels = mask.load()
    
    # Start coordinates for flood fill (the four corners)
    corners = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]
    queue = list(corners)
    visited = set(corners)
    
    # Collect corner colors to check tolerance
    corner_colors = [pixels[pt] for pt in corners]
    
    for pt in corners:
        mask_pixels[pt] = 0
        
    def is_background(color):
        r, g, b, a = color
        # If already highly transparent, it's background
        if a < 10:
            return True
        # If it's near pure white
        if r > 240 and g > 240 and b > 240:
            return True
        # If it's close to any of the corner colors
        for cr, cg, cb, ca in corner_colors:
            if abs(r - cr) < tolerance and abs(g - cg) < tolerance and abs(b - cb) < tolerance:
                return True
        return False

    transparent_count = len(corners)
    
    while queue:
        cx, cy = queue.pop(0)
        # Check 4 neighbors
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < width and 0 <= ny < height:
                if (nx, ny) not in visited:
                    color = pixels[nx, ny]
                    if is_background(color):
                        visited.add((nx, ny))
                        mask_pixels[nx, ny] = 0
                        queue.append((nx, ny))
                        transparent_count += 1
                        
    # Apply the mask as the alpha channel
    r, g, b, a = img.split()
    # Merge existing alpha channel with our new mask
    new_alpha = Image.eval(mask, lambda p: p) # Copy mask
    
    result = Image.merge("RGBA", (r, g, b, new_alpha))
    print(f"Flood fill completed. Made {transparent_count} pixels transparent out of {width * height} total pixels.")
    return result

def main():
    source = "extension/icons/icon.png"
    output = "extension/icons/icon.png" # Overwrite original icon.png
    
    # Create backup first
    backup = "extension/icons/icon_backup.png"
    if not os.path.exists(backup):
        os.system(f"cp {source} {backup}")
        print(f"Created backup of original icon: {backup}")
        
    print(f"Removing white background from {backup}...")
    processed_img = remove_white_background(backup, tolerance=20)
    
    # Save the processed image back to icon.png
    processed_img.save(output, "PNG")
    print(f"Saved transparent icon to: {output}")

if __name__ == "__main__":
    main()
