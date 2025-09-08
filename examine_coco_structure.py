#!/usr/bin/env python3

import json
import sys

def examine_coco_structure(json_file_path):
    print(f"=== EXAMINING COCO ANNOTATION STRUCTURE: {json_file_path} ===")
    print()
    
    try:
        with open(json_file_path, 'r') as f:
            data = json.load(f)
        
        # Check main structure
        print("📊 Main sections found:")
        for key in data.keys():
            if key == 'categories':
                print(f"   ✅ {key}: {len(data[key])} entries")
            elif key == 'images':
                print(f"   📸 {key}: {len(data[key])} entries")
            elif key == 'annotations':
                print(f"   🏷️ {key}: {len(data[key])} entries")
            else:
                print(f"   📋 {key}: {data[key] if not isinstance(data[key], list) else f'{len(data[key])} entries'}")
        print()
        
        # Examine categories (food labels)
        if 'categories' in data:
            categories = data['categories']
            print(f"🍽️ FOOD CATEGORIES ({len(categories)} total):")
            for i, category in enumerate(categories[:20]):  # Show first 20
                print(f"   {category['id']}: {category['name']}")
            if len(categories) > 20:
                print(f"   ... and {len(categories) - 20} more")
            print()
            
            # Show all unique category names
            category_names = [cat['name'] for cat in categories]
            print("🔍 All category names:")
            for name in sorted(set(category_names))[:50]:  # First 50 unique names
                print(f"   {name}")
            if len(set(category_names)) > 50:
                print(f"   ... and {len(set(category_names)) - 50} more")
        else:
            print("❌ No 'categories' section found!")
        
        print()
        
        # Examine a few sample images
        if 'images' in data:
            print("🖼️ Sample images:")
            for i, img in enumerate(data['images'][:5]):
                print(f"   ID {img['id']}: {img['file_name']} ({img['width']}x{img['height']})")
        
        print()
        
        # Examine a few sample annotations
        if 'annotations' in data:
            print("🏷️ Sample annotations:")
            for i, ann in enumerate(data['annotations'][:3]):
                print(f"   Annotation {ann['id']}: image_id={ann['image_id']}, category_id={ann['category_id']}")
        
    except Exception as e:
        print(f"❌ Error reading {json_file_path}: {e}")

if __name__ == "__main__":
    train_file = "/home/sss/Code/gutty/datasets/FoodInsSeg/annotations/Train.json"
    test_file = "/home/sss/Code/gutty/datasets/FoodInsSeg/annotations/Test.json"
    
    examine_coco_structure(train_file)
    print("\n" + "="*80 + "\n")
    examine_coco_structure(test_file)