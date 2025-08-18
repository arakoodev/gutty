#!/usr/bin/env tsx
import { connectDB } from "./src/index/lancedb";

async function checkRecipe() {
  try {
    const db = await connectDB();
    const recipesTable = await db.openTable("recipes");
    
    // Find recipe 140278 that was matched
    const recipes = await recipesTable.query().limit(1000).toArray();
    const recipe = recipes.find(r => r.id === "140278");
    
    if (recipe) {
      console.log('=== Matched Recipe Analysis ===');
      console.log(`ID: ${recipe.id}`);
      console.log(`Title: ${recipe.title}`);
      console.log(`Instructions: ${recipe.instructions?.substring(0, 200)}...`);
      console.log(`\nIngredients (${recipe.ingredients?.length}):`);
      recipe.ingredients?.forEach((ing, i) => {
        console.log(`${i+1}. ${ing.text || ing.ingredient || ing.name}`);
      });
      
      // Analyze ingredient types
      console.log('\n=== Ingredient Analysis ===');
      const ingredientTexts = recipe.ingredients?.map(ing => (ing.text || ing.ingredient || ing.name || '').toLowerCase()) || [];
      
      const meatWords = ['beef', 'chicken', 'pork', 'lamb', 'meat', 'steak'];
      const vegetableWords = ['pumpkin', 'squash', 'gourd', 'tomato', 'onion', 'vegetable'];
      
      const meatCount = ingredientTexts.filter(ing => meatWords.some(meat => ing.includes(meat))).length;
      const vegetableCount = ingredientTexts.filter(ing => vegetableWords.some(veg => ing.includes(veg))).length;
      
      console.log(`Meat ingredients: ${meatCount}`);
      console.log(`Vegetable ingredients: ${vegetableCount}`);
      console.log(`Recipe appears to be: ${meatCount > 0 ? 'MEAT-BASED' : 'VEGETARIAN'}`);
      
    } else {
      console.log('Recipe 140278 not found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkRecipe();