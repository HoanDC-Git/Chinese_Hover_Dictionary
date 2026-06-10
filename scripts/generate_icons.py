from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, filename, bg_color, text, text_color):
    # Create a square image with transparent background
    img = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    
    # Draw rounded circle background
    margin = max(1, size // 16)
    draw.ellipse([margin, margin, size - margin, size - margin], fill=bg_color)
    
    # Load Chinese font
    font_path = "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf"
    if not os.path.exists(font_path):
        # Fallback to default if not exists
        font = ImageFont.load_default()
    else:
        # Scale font size based on icon size
        font_size = int(size * 0.6)
        font = ImageFont.truetype(font_path, font_size)
    
    # Calculate text size and position to center it
    # Use textbbox in modern Pillow versions
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        x = (size - text_width) // 2 - bbox[0]
        y = (size - text_height) // 2 - bbox[1]
    except AttributeError:
        # Fallback for older Pillow versions
        text_width, text_height = draw.textsize(text, font=font)
        x = (size - text_width) // 2
        y = (size - text_height) // 2
        
    # Draw text
    draw.text((x, y), text, fill=text_color, font=font)
    
    # Save the icon
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    img.save(filename, 'PNG')
    print(f"Generated: {filename} ({size}x{size})")

def main():
    sizes = [16, 48, 128]
    
    # Active State: Red background, White text
    active_bg = (238, 28, 37, 255) # Rich Chinese Red
    active_text = "译"
    
    # Inactive State: Dark gray/slate background, White text
    inactive_bg = (113, 128, 150, 255) # Slate Gray
    inactive_text = "译"
    
    text_color = (255, 255, 255, 255)
    
    for size in sizes:
        # Active icons
        active_filename = f"extension/icons/icon{size}.png"
        create_icon(size, active_filename, active_bg, active_text, text_color)
        
        # Inactive icons
        inactive_filename = f"extension/icons/icon{size}_gray.png"
        create_icon(size, inactive_filename, inactive_bg, inactive_text, text_color)

if __name__ == "__main__":
    main()
