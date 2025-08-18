export const CFG = {
  storage: { 
    lancedbDir: "./lancedb", 
    recipesTable: "recipes", 
    segmentsTable: "segments",
    nutritionTable: "nutrition_facts",
    glycemicTable: "glycemic_index",
    fodmapTable: "fodmap_data"
  },
  datasets: {
    baseDir: "./datasets",
    foodinsseg: {
      dir: "./datasets/foodinsseg",
      imageDir: "./datasets/foodinsseg/images"
    },
    foodseg103: {
      dir: "./datasets/foodseg103", 
      dataDir: "./datasets/foodseg103/data"
    },
    uecfood256: {
      dir: "./datasets/uecfood256",
      imageDir: "./datasets/uecfood256/images"
    },
    uecfood100: {
      dir: "./datasets/uecfood100",
      imageDir: "./datasets/uecfood100/images"
    },
    recipe1m: {
      dir: "./datasets/recipe1m",
      dataDir: "./datasets/recipe1m/data",
      imageDir: "./datasets/recipe1m/images"
    }
  },
  providers: {
    vertex: {
      projectId: process.env.VERTEX_PROJECT_ID || "",
      location: process.env.VERTEX_LOCATION || "us-central1",
      imgEmbed: process.env.VERTEX_IMG_EMBED_MODEL || "multimodalembedding@001",
      txtEmbed: process.env.VERTEX_TXT_EMBED_MODEL || "textembedding-gecko@003",
      visionLLM: process.env.VERTEX_VISION_LLM || "gemini-1.5-flash",
      textLLM: process.env.VERTEX_TEXT_LLM || "gemini-1.5-flash"
    }
  },
  fdc: { apiKey: process.env.FDC_API_KEY || "" }
};
