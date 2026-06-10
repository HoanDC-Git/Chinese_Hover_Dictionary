import sqlite3
import json
import os

def convert_database():
    db_path = "data/zh.db"
    output_dir = "extension/data"
    output_path = os.path.join(output_dir, "dictionary.json")
    
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"Connecting to SQLite database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check if table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='vocabulary';")
    if not cursor.fetchone():
        print("ERROR: vocabulary table not found in the database!")
        conn.close()
        return
        
    print("Reading rows from vocabulary table...")
    # Select columns: word, pinyin, pos, meaning_vi, meaning_en, hsk_level
    cursor.execute("SELECT word, pinyin, pos, meaning_vi, meaning_en, hsk_level FROM vocabulary;")
    rows = cursor.fetchall()
    
    dictionary = {}
    
    for row in rows:
        word, pinyin, pos, meaning_vi, meaning_en, hsk_level = row
        
        # Strip whitespace, replace None with empty string
        word = word.strip() if word else ""
        if not word:
            continue
            
        pinyin = pinyin.strip() if pinyin else ""
        pos = pos.strip() if pos else ""
        meaning_vi = meaning_vi.strip() if meaning_vi else ""
        meaning_en = meaning_en.strip() if meaning_en else ""
        hsk_level = hsk_level.strip() if hsk_level else ""
        
        definition = [pinyin, pos, meaning_vi, meaning_en, hsk_level]
        
        if word in dictionary:
            dictionary[word].append(definition)
        else:
            dictionary[word] = [definition]
            
    print(f"Processed {len(rows)} entries into {len(dictionary)} unique words.")
    
    print(f"Saving to {output_path}...")
    with open(output_path, 'w', encoding='utf-8') as f:
        # Save as compact JSON without formatting spaces to minimize file size
        json.dump(dictionary, f, separators=(',', ':'), ensure_ascii=False)
        
    # Check output file size
    size_bytes = os.path.getsize(output_path)
    print(f"Conversion complete! Output size: {size_bytes / (1024*1024):.2f} MB ({size_bytes} bytes)")
    conn.close()

if __name__ == "__main__":
    convert_database()
