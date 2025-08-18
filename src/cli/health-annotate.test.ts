import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { expect, test, vi } from 'vitest';

const { searchMock } = vi.hoisted(() => ({
  searchMock: vi.fn().mockImplementation(() => ({
    where: () => ({ limit: () => ({ toArray: async () => [{ id: 'doc' }] }) }),
  })),
}));
vi.mock('../index/lancedb', () => ({ connectDB: async () => ({ openTable: async () => ({ search: searchMock }) }) }));
vi.mock('../providers/selector', () => ({ withFallback: async (fn: any) => fn({ textEmbed: async () => new Float32Array([1]) }) }));

import command from './health-annotate';

test('health-annotate adds notes and evidence', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-'));
  const recipe = { ingredients:[{name:'shark',qty:1,unit:'fillet'},{name:'sugar',qty:1,unit:'tsp'}] };
  const recipePath = path.join(tmp, 'r.json');
  const out = path.join(tmp, 'ann.json');
  await fs.writeFile(recipePath, JSON.stringify(recipe));
  await command.parseAsync(['node','test','--recipe',recipePath,'--verticals','pregnancy,pcos','--out',out], { from:'node' });
  const res = JSON.parse(await fs.readFile(out,'utf8'));
  expect(res.notes[0].ingredient).toBe('shark');
  expect(res.evidence.length).toBe(2);
});

test('health-annotate detects IBS high-FODMAP triggers', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-'));
  const recipe = { 
    ingredients: [
      {name:'onion',qty:1,unit:'cup'},
      {name:'garlic',qty:3,unit:'cloves'},
      {name:'wheat',qty:100,unit:'g'},
      {name:'apple',qty:1,unit:'piece'},
      {name:'cashews',qty:30,unit:'g'},
      {name:'rice',qty:1,unit:'cup'} // Not a trigger
    ] 
  };
  const recipePath = path.join(tmp, 'r.json');
  const out = path.join(tmp, 'ibs.json');
  await fs.writeFile(recipePath, JSON.stringify(recipe));
  await command.parseAsync(['node','test','--recipe',recipePath,'--verticals','ibs','--out',out], { from:'node' });
  const res = JSON.parse(await fs.readFile(out,'utf8'));
  
  // Should flag all high-FODMAP ingredients
  expect(res.notes).toHaveLength(5);
  expect(res.notes.map((n:any) => n.ingredient)).toEqual(['onion','garlic','wheat','apple','cashews']);
  expect(res.notes[0].flag).toBe('high-FODMAP food (may trigger symptoms)');
  expect(res.notes[0].ref).toBe('Monash FODMAP research');
  expect(res.evidence.length).toBe(1); // IBS vertical evidence
});

test('health-annotate supports multi-vertical with IBS', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-'));
  const recipe = { 
    ingredients: [
      {name:'swordfish',qty:150,unit:'g'}, // Pregnancy trigger
      {name:'onion',qty:1,unit:'cup'},     // IBS trigger  
      {name:'sugar',qty:2,unit:'tbsp'}     // PCOS trigger
    ] 
  };
  const recipePath = path.join(tmp, 'r.json');
  const out = path.join(tmp, 'multi.json');
  await fs.writeFile(recipePath, JSON.stringify(recipe));
  await command.parseAsync(['node','test','--recipe',recipePath,'--verticals','pregnancy,ibs,pcos','--out',out], { from:'node' });
  const res = JSON.parse(await fs.readFile(out,'utf8'));
  
  // Should have triggers from all three verticals
  const pregnancyNotes = res.notes.filter((n:any) => n.vertical === 'pregnancy');
  const ibsNotes = res.notes.filter((n:any) => n.vertical === 'ibs');
  
  expect(pregnancyNotes).toHaveLength(1);
  expect(pregnancyNotes[0].ingredient).toBe('swordfish');
  
  expect(ibsNotes).toHaveLength(1); 
  expect(ibsNotes[0].ingredient).toBe('onion');
  
  expect(res.evidence.length).toBe(3); // All three verticals
});

