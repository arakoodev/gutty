#!/usr/bin/env tsx
import { connectDB } from "./src/index/lancedb";

async function searchRecipe() {
  try {
    const db = await connectDB();
    const recipesTable = await db.openTable("recipes");
    
    // Get more recipes and search for 140278
    const recipes = await recipesTable.query().limit(5000).toArray();
    console.log(`Total recipes in database: ${recipes.length}`);
    
    const targetRecipe = recipes.find(r => String(r.id) === '140278');
    
    if (targetRecipe) {
      console.log('=== FOUND RECIPE 140278 ===');
      console.log(`Title: ${targetRecipe.title}`);
      console.log(`Instructions: ${targetRecipe.instructions?.substring(0, 300)}...`);
      
      console.log('\n=== INGREDIENTS ===');
      if (targetRecipe.ingredients) {
        targetRecipe.ingredients.forEach((ing, i) => {
          const text = ing.text || ing.ingredient || ing.name || JSON.stringify(ing);
          console.log(`${i+1}. ${text}`);
        });
      } else {
        console.log('No ingredients found');
      }
      
      // Check if it's a meat or vegetable dish
      const allText = (targetRecipe.title + ' ' + targetRecipe.instructions + ' ' + 
                      JSON.stringify(targetRecipe.ingredients)).toLowerCase();
      
      const hasMeat = ['beef', 'chicken', 'pork', 'lamb', 'meat', 'steak'].some(word => allText.includes(word));
      const hasVegetables = ['pumpkin', 'squash', 'gourd', 'vegetable', 'tomato'].some(word => allText.includes(word));
      
      console.log(`\n=== ANALYSIS ===`);
      console.log(`Contains meat references: ${hasMeat}`);
      console.log(`Contains vegetable references: ${hasVegetables}`);
      console.log(`Recipe type: ${hasMeat ? 'MEAT-BASED' : 'VEGETARIAN'}`);
      
    } else {
      console.log('Recipe 140278 still not found');
      
      // Look for "Stew In A Pumpkin" by title
      const pumpkinStew = recipes.find(r => 
        r.title?.toLowerCase().includes('stew') && 
        r.title?.toLowerCase().includes('pumpkin')
      );
      
      if (pumpkinStew) {
        console.log(`\nFound similar: ${pumpkinStew.id} - ${pumpkinStew.title}`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

searchRecipe();