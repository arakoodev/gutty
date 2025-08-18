#!/usr/bin/env tsx
import { connectDB } from "./src/index/lancedb";

async function findRecipe() {
  try {
    const db = await connectDB();
    const recipesTable = await db.openTable("recipes");
    
    // Get some sample recipes to understand structure
    const recipes = await recipesTable.query().limit(10).toArray();
    
    console.log('=== Sample recipes in database ===');
    recipes.forEach((recipe, i) => {
      console.log(`${i+1}. ID: ${recipe.id}, Title: ${recipe.title?.substring(0, 50)}...`);
    });
    
    // Look for recipe with ID 140278 or similar
    console.log('\n=== Searching for recipe 140278 ===');
    const targetRecipe = recipes.find(r => String(r.id).includes('140278'));
    
    if (targetRecipe) {
      console.log(`Found: ${targetRecipe.title}`);
      console.log('Ingredients:');
      targetRecipe.ingredients?.forEach((ing, i) => {
        console.log(`  ${i+1}. ${ing.text || ing.ingredient || ing.name || JSON.stringify(ing)}`);
      });
    } else {
      console.log('Recipe 140278 not found in current batch');
      
      // Search more broadly
      console.log('\n=== Searching for pumpkin/stew recipes ===');
      const pumpkinRecipes = recipes.filter(r => 
        r.title?.toLowerCase().includes('pumpkin') || 
        r.title?.toLowerCase().includes('stew')
      );
      
      pumpkinRecipes.forEach(recipe => {
        console.log(`- ${recipe.id}: ${recipe.title}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

findRecipe();