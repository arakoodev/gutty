import { promises as fs } from "fs";
import path from "path";

export interface CocoAnnotation {
  info: {
    year: number;
    version: number;
    description: string;
    url: string;
  };
  images: Array<{
    id: number;
    width: number;
    height: number;
    file_name: string;
  }>;
  annotations: Array<{
    id: number;
    image_id: number;
    category_id: number;
    bbox?: number[];
    segmentation?: any;
  }>;
  categories: Array<{
    id: number;
    name: string;
    supercategory?: string;
  }>;
}

export interface ImageLabelMap {
  [imageName: string]: string[];
}

export class CocoParser {
  private annotations?: CocoAnnotation;
  private categoryMap?: Map<number, string>;
  private imageLabelMap?: ImageLabelMap;

  constructor(private annotationPath: string) {}

  async load(): Promise<void> {
    console.log(`📖 Loading COCO annotations from ${this.annotationPath}...`);
    const data = await fs.readFile(this.annotationPath, 'utf8');
    this.annotations = JSON.parse(data);
    
    if (!this.annotations) {
      throw new Error("Failed to parse COCO annotations");
    }

    // Build category ID to name mapping
    this.categoryMap = new Map();
    for (const category of this.annotations.categories) {
      this.categoryMap.set(category.id, category.name);
    }

    // Build image name to labels mapping
    this.imageLabelMap = {};
    
    // Create image ID to filename mapping
    const imageIdToName = new Map<number, string>();
    for (const image of this.annotations.images) {
      imageIdToName.set(image.id, image.file_name);
    }

    // Map annotations to image files
    for (const annotation of this.annotations.annotations) {
      const imageName = imageIdToName.get(annotation.image_id);
      const categoryName = this.categoryMap.get(annotation.category_id);
      
      if (imageName && categoryName) {
        if (!this.imageLabelMap[imageName]) {
          this.imageLabelMap[imageName] = [];
        }
        // Avoid duplicate labels for the same image
        if (!this.imageLabelMap[imageName].includes(categoryName)) {
          this.imageLabelMap[imageName].push(categoryName);
        }
      }
    }

    console.log(`✅ Parsed ${this.annotations.categories.length} categories, ${this.annotations.images.length} images, ${this.annotations.annotations.length} annotations`);
    console.log(`🏷️ Found labels for ${Object.keys(this.imageLabelMap).length} images`);
  }

  getImageLabels(imageName: string): string[] {
    if (!this.imageLabelMap) {
      throw new Error("COCO annotations not loaded. Call load() first.");
    }
    return this.imageLabelMap[imageName] || [];
  }

  getAllCategories(): string[] {
    if (!this.annotations) {
      throw new Error("COCO annotations not loaded. Call load() first.");
    }
    return this.annotations.categories.map(cat => cat.name);
  }

  getImageCount(): number {
    if (!this.annotations) {
      throw new Error("COCO annotations not loaded. Call load() first.");
    }
    return this.annotations.images.length;
  }

  getCategoryCount(): number {
    if (!this.annotations) {
      throw new Error("COCO annotations not loaded. Call load() first.");
    }
    return this.annotations.categories.length;
  }

  // Get the primary (most confident) label for an image
  getPrimaryLabel(imageName: string): string | null {
    const labels = this.getImageLabels(imageName);
    if (labels.length === 0) return null;
    
    // For now, just return the first label. Could be enhanced to rank by confidence
    // or by frequency in the dataset
    return labels[0];
  }

  // Get a display-friendly label combining multiple ingredients
  getCombinedLabel(imageName: string): string {
    const labels = this.getImageLabels(imageName);
    if (labels.length === 0) return "unknown";
    if (labels.length === 1) return labels[0];
    
    // For multiple labels, create a combined name
    const sortedLabels = labels.sort();
    if (sortedLabels.length <= 3) {
      return sortedLabels.join(" + ");
    } else {
      return `${sortedLabels[0]} + ${sortedLabels.length - 1} more`;
    }
  }

  // Get statistics about the dataset
  getStats(): {
    totalImages: number;
    totalCategories: number; 
    totalAnnotations: number;
    imagesWithLabels: number;
    averageLabelsPerImage: number;
    topCategories: Array<{name: string, count: number}>;
  } {
    if (!this.annotations || !this.imageLabelMap) {
      throw new Error("COCO annotations not loaded. Call load() first.");
    }

    const categoryCount: {[name: string]: number} = {};
    let totalLabels = 0;
    
    for (const labels of Object.values(this.imageLabelMap)) {
      totalLabels += labels.length;
      for (const label of labels) {
        categoryCount[label] = (categoryCount[label] || 0) + 1;
      }
    }

    const topCategories = Object.entries(categoryCount)
      .map(([name, count]) => ({name, count}))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalImages: this.annotations.images.length,
      totalCategories: this.annotations.categories.length,
      totalAnnotations: this.annotations.annotations.length,
      imagesWithLabels: Object.keys(this.imageLabelMap).length,
      averageLabelsPerImage: totalLabels / Object.keys(this.imageLabelMap).length,
      topCategories
    };
  }
}