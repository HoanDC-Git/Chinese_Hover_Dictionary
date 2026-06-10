import sqlite3
import json
import re
import os

PinyinToneMark = {
    0: "aoeiuü",
    1: "āōēīūǖ",
    2: "áóéíúǘ",
    3: "ǎǒěǐǔǚ",
    4: "àòèìùǜ"
}

def decode_pinyin(pinyin):
    # Convert numbered pinyin to accented pinyin (e.g., "yao1 yao1 ling2" -> "yāo yāo líng")
    words = pinyin.split()
    results = []
    for word in words:
        # check if it ends with a digit
        if len(word) > 0 and word[-1].isdigit():
            tone = int(word[-1])
            clean_word = word[:-1]
        else:
            tone = 5
            clean_word = word
            
        clean_word = clean_word.replace("u:", "ü").replace("v", "ü")
        
        if tone == 5 or tone == 0:
            results.append(clean_word)
            continue
            
        vowels = "aeiouü"
        found = False
        
        # 1. Check "a" or "e"
        for v in ["a", "e"]:
            if v in clean_word:
                idx = clean_word.index(v)
                accented = PinyinToneMark[tone][PinyinToneMark[0].index(v)]
                clean_word = clean_word[:idx] + accented + clean_word[idx+1:]
                found = True
                break
                
        if not found:
            # 2. Check "ou"
            if "ou" in clean_word:
                idx = clean_word.index("o")
                accented = PinyinToneMark[tone][PinyinToneMark[0].index("o")]
                clean_word = clean_word[:idx] + accented + clean_word[idx+1:]
                found = True
                
        if not found:
            # 3. Find the last vowel (covers iu and ui rules)
            last_v_idx = -1
            last_v = None
            for idx, char in enumerate(clean_word):
                if char in vowels:
                    last_v_idx = idx
                    last_v = char
            if last_v_idx != -1:
                accented = PinyinToneMark[tone][PinyinToneMark[0].index(last_v)]
                clean_word = clean_word[:last_v_idx] + accented + clean_word[last_v_idx+1:]
                
        results.append(clean_word)
    return " ".join(results)

def main():
    print("Starting dictionary merge...")
    
    # 1. Load existing database vocabulary (HSK dictionary)
    db_path = "data/zh.db"
    vocab_dict = {}
    if os.path.exists(db_path):
        print(f"Loading vocabulary from {db_path}...")
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT word, pinyin, pos, meaning_vi, meaning_en, hsk_level FROM vocabulary")
        rows = cursor.fetchall()
        for word, pinyin, pos, meaning_vi, meaning_en, hsk_level in rows:
            # Struct: [pinyin, pos, meaning_vi, meaning_en, hsk_level]
            if word not in vocab_dict:
                vocab_dict[word] = []
            vocab_dict[word].append([
                pinyin or "",
                pos or "",
                meaning_vi or "",
                meaning_en or "",
                str(hsk_level) if hsk_level else ""
            ])
        conn.close()
        print(f"Loaded {len(vocab_dict)} unique words from database.")
    else:
        print("Warning: data/zh.db not found. Starting with empty database vocabulary.")

    # 2. Load and parse CC-CEDICT from cg_cedict.txt (English dictionary)
    cedict_path = "extension/data/cg_cedict.txt"
    if not os.path.exists(cedict_path):
        print(f"Error: {cedict_path} not found. Please place cg_cedict.txt in extension/data/.")
        return
        
    print(f"Parsing CC-CEDICT from {cedict_path}...")
    line_pattern = re.compile(r"^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+/(.+)/$")
    
    english_db = {}
    cedict_count = 0
    
    with open(cedict_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
                
            match = line_pattern.match(line)
            if not match:
                continue
                
            trad, simp, pinyin_num, english_raw = match.groups()
            cedict_count += 1
            pinyin_num_clean = pinyin_num.strip().lower()
            english_def = english_raw.replace("/", "; ")
            english_db[(trad, simp, pinyin_num_clean)] = english_def
            
    print(f"Indexed {len(english_db)} English definitions from CC-CEDICT.")

    # 3. Load and parse CVDICT from cv_cedict.txt (Vietnamese dictionary)
    cvdict_path = "extension/data/cv_cedict.txt"
    if not os.path.exists(cvdict_path):
        print(f"Error: {cvdict_path} not found. Please place cv_cedict.txt in extension/data/.")
        return
        
    print(f"Parsing CVDICT from {cvdict_path}...")
    cvdict_count = 0
    new_words_count = 0
    enriched_count = 0
    matched_keys = set()
    
    with open(cvdict_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
                
            match = line_pattern.match(line)
            if not match:
                continue
                
            trad, simp, pinyin_num, vietnamese_raw = match.groups()
            cvdict_count += 1
            pinyin_num_clean = pinyin_num.strip().lower()
            
            # Format pinyin
            pinyin_acc = decode_pinyin(pinyin_num)
            
            # Format vietnamese definition
            vietnamese_def = vietnamese_raw.replace("/", "; ")
            
            # Get matching english definition
            key = (trad, simp, pinyin_num_clean)
            english_def = english_db.get(key, "")
            if key in english_db:
                matched_keys.add(key)
            
            # We map the definition to both Traditional and Simplified Chinese words
            for word in set([trad, simp]):
                # If word is already in HSK vocabulary, we preserve HSK definitions (richer / has Vietnamese)
                # but we can enrich HSK entry Vietnamese/English definition if it is empty
                found_entry = None
                if word in vocab_dict:
                    for entry in vocab_dict[word]:
                        if entry[0].lower().replace(" ", "") == pinyin_acc.lower().replace(" ", ""):
                            found_entry = entry
                            break
                
                if found_entry:
                    if not found_entry[2] and vietnamese_def:
                        found_entry[2] = vietnamese_def
                    if not found_entry[3] and english_def:
                        found_entry[3] = english_def
                    enriched_count += 1
                else:
                    # New word or new pronunciation from CVDICT!
                    if word not in vocab_dict:
                        vocab_dict[word] = []
                    vocab_dict[word].append([
                        pinyin_acc,
                        "",           # pos (empty)
                        vietnamese_def,
                        english_def,
                        ""            # hsk_level (empty)
                    ])
                    new_words_count += 1
                    
    print(f"Parsed {cvdict_count} CVDICT records.")
    print(f"Enriched {enriched_count} existing vocabulary entries.")
    print(f"Added {new_words_count} new word entries from CVDICT.")

    # 4. Add any remaining English-only entries from CC-CEDICT that didn't have a match in CVDICT
    remaining_count = 0
    for key, english_def in english_db.items():
        if key in matched_keys:
            continue
        trad, simp, pinyin_num_clean = key
        pinyin_acc = decode_pinyin(pinyin_num_clean)
        
        for word in set([trad, simp]):
            found_entry = None
            if word in vocab_dict:
                for entry in vocab_dict[word]:
                    if entry[0].lower().replace(" ", "") == pinyin_acc.lower().replace(" ", ""):
                        found_entry = entry
                        break
            
            if found_entry:
                if not found_entry[3] and english_def:
                    found_entry[3] = english_def
            else:
                if word not in vocab_dict:
                    vocab_dict[word] = []
                vocab_dict[word].append([
                    pinyin_acc,
                    "",           # pos
                    "",           # meaning_vi (empty)
                    english_def,
                    ""            # hsk_level
                ])
                remaining_count += 1

    print(f"Added {remaining_count} remaining English-only entries from CC-CEDICT.")
    print(f"Total keys in merged dictionary: {len(vocab_dict)}")
    
    # 5. Export to JSON
    output_path = "extension/data/dictionary.json"
    print(f"Writing merged dictionary to {output_path}...")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(vocab_dict, f, ensure_ascii=False, separators=(',', ':'))
        
    file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"Successfully generated {output_path} (Size: {file_size_mb:.2f} MB).")

if __name__ == "__main__":
    main()
