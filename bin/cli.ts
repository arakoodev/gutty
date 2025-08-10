#!/usr/bin/env tsx
import { Command } from "commander";
import "dotenv/config";

import init from "../src/cli/init";
import ingestRecipes from "../src/cli/ingest-recipes";
import embedRecipes from "../src/cli/embed-recipes";
import buildIndex from "../src/cli/build-index";
import recipeRetrieve from "../src/cli/recipe-retrieve";
import recipeRerank from "../src/cli/recipe-rerank";
import recipeRag from "../src/cli/recipe-rag";
import calories from "../src/cli/calories";
import validate from "../src/cli/validate";
import reset from "../src/cli/reset";
import recipeAnalyze from "../src/cli/recipe-analyze";
import healthIngest from "../src/cli/health-ingest";
import healthEmbed from "../src/cli/health-embed";
import healthBuildIndex from "../src/cli/health-build-index";
import healthQuery from "../src/cli/health-query";
import healthAnnotate from "../src/cli/health-annotate";

const program = new Command();
program.name("gutty").description("Photo → Recipe → Calories (standalone CLI)");

program.addCommand(init);
program.addCommand(ingestRecipes);
program.addCommand(embedRecipes);
program.addCommand(buildIndex);
program.addCommand(recipeRetrieve);
program.addCommand(recipeRerank);
program.addCommand(recipeRag);
program.addCommand(calories);
program.addCommand(recipeAnalyze);
program.addCommand(healthIngest);
program.addCommand(healthEmbed);
program.addCommand(healthBuildIndex);
program.addCommand(healthQuery);
program.addCommand(healthAnnotate);
program.addCommand(validate);
program.addCommand(reset);

program.parseAsync();
