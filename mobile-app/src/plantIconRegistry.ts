export interface PlantIconDefinition {
  id: string;
  canonicalName: string;
  aliases: string[];
  /** Existing emoji value stored in PlantProfile.icon. */
  icon: string;
}

/**
 * One registry for every icon offered by the existing plant editor.
 * Aliases are intentionally explicit and deterministic; matching never uses
 * fuzzy substring guesses that could overwrite a custom plant name.
 */
export const PLANT_ICON_REGISTRY: readonly PlantIconDefinition[] = [
  { id: 'spinach', canonicalName: 'Spinach', aliases: ['spinach'], icon: '🌱' },
  { id: 'tomato', canonicalName: 'Tomatoes', aliases: ['tomato', 'tomatoes'], icon: '🍅' },
  { id: 'pepper', canonicalName: 'Bell peppers', aliases: ['pepper', 'peppers', 'bell pepper', 'bell peppers'], icon: '🌶️' },
  { id: 'carrot', canonicalName: 'Carrots', aliases: ['carrot', 'carrots'], icon: '🥕' },
  { id: 'lettuce', canonicalName: 'Lettuce', aliases: ['lettuce', 'lettuces'], icon: '🥬' },
  { id: 'kale', canonicalName: 'Kale', aliases: ['kale'], icon: '🌿' },
  { id: 'cucumber', canonicalName: 'Cucumbers', aliases: ['cucumber', 'cucumbers'], icon: '🥒' },
  { id: 'onion', canonicalName: 'Onions', aliases: ['onion', 'onions'], icon: '🧅' },
  { id: 'strawberry', canonicalName: 'Strawberries', aliases: ['strawberry', 'strawberries'], icon: '🍓' },
  { id: 'broccoli', canonicalName: 'Broccoli', aliases: ['broccoli'], icon: '🥦' },
  { id: 'potato', canonicalName: 'Potatoes', aliases: ['potato', 'potatoes'], icon: '🥔' },
  { id: 'corn', canonicalName: 'Corn', aliases: ['corn', 'sweet corn'], icon: '🌽' },
  { id: 'sweet-pepper', canonicalName: 'Sweet Peppers', aliases: ['sweet pepper', 'sweet peppers', 'capsicum', 'capsicums'], icon: '🫑' },
  { id: 'eggplant', canonicalName: 'Eggplants', aliases: ['eggplant', 'eggplants', 'aubergine', 'aubergines'], icon: '🍆' },
  { id: 'garlic', canonicalName: 'Garlic', aliases: ['garlic'], icon: '🧄' },
  { id: 'pea', canonicalName: 'Peas', aliases: ['pea', 'peas'], icon: '🫛' },
  { id: 'grain', canonicalName: 'Grain', aliases: ['grain', 'grains', 'wheat'], icon: '🌾' },
  { id: 'custom', canonicalName: 'Custom Plant', aliases: [], icon: '🪴' },
  { id: 'blossom', canonicalName: 'Blossoms', aliases: ['blossom', 'blossoms', 'flower', 'flowers'], icon: '🌸' },
  { id: 'sunflower', canonicalName: 'Sunflowers', aliases: ['sunflower', 'sunflowers'], icon: '🌻' },
  { id: 'blueberry', canonicalName: 'Blueberries', aliases: ['blueberry', 'blueberries'], icon: '🫐' },
  { id: 'apple', canonicalName: 'Apples', aliases: ['apple', 'apples'], icon: '🍎' },
  { id: 'lemon', canonicalName: 'Lemons', aliases: ['lemon', 'lemons'], icon: '🍋' },
  { id: 'tree', canonicalName: 'Trees', aliases: ['tree', 'trees'], icon: '🌳' },
  { id: 'watermelon', canonicalName: 'Watermelons', aliases: ['watermelon', 'watermelons'], icon: '🍉' },
  { id: 'pumpkin', canonicalName: 'Pumpkins', aliases: ['pumpkin', 'pumpkins'], icon: '🎃' },
  { id: 'mixed-greens', canonicalName: 'Mixed Greens', aliases: ['mixed greens', 'salad greens'], icon: '🥗' },
  { id: 'sweet-potato', canonicalName: 'Sweet Potatoes', aliases: ['sweet potato', 'sweet potatoes', 'yam', 'yams'], icon: '🍠' },
  { id: 'peanut', canonicalName: 'Peanuts', aliases: ['peanut', 'peanuts'], icon: '🥜' },
  { id: 'mushroom', canonicalName: 'Mushrooms', aliases: ['mushroom', 'mushrooms'], icon: '🍄' },
  { id: 'grape', canonicalName: 'Grapes', aliases: ['grape', 'grapes'], icon: '🍇' },
  { id: 'melon', canonicalName: 'Melons', aliases: ['melon', 'melons'], icon: '🍈' },
  { id: 'orange', canonicalName: 'Oranges', aliases: ['orange', 'oranges'], icon: '🍊' },
  { id: 'pear', canonicalName: 'Pears', aliases: ['pear', 'pears'], icon: '🍐' },
  { id: 'peach', canonicalName: 'Peaches', aliases: ['peach', 'peaches'], icon: '🍑' },
  { id: 'cherry', canonicalName: 'Cherries', aliases: ['cherry', 'cherries'], icon: '🍒' },
  { id: 'mango', canonicalName: 'Mangoes', aliases: ['mango', 'mangoes', 'mangos'], icon: '🥭' },
  { id: 'pineapple', canonicalName: 'Pineapples', aliases: ['pineapple', 'pineapples'], icon: '🍍' },
  { id: 'coconut', canonicalName: 'Coconuts', aliases: ['coconut', 'coconuts'], icon: '🥥' },
  { id: 'avocado', canonicalName: 'Avocados', aliases: ['avocado', 'avocados'], icon: '🥑' },
  { id: 'olive', canonicalName: 'Olives', aliases: ['olive', 'olives'], icon: '🫒' },
  { id: 'bean', canonicalName: 'Beans', aliases: ['bean', 'beans'], icon: '🫘' },
  { id: 'chestnut', canonicalName: 'Chestnuts', aliases: ['chestnut', 'chestnuts'], icon: '🌰' },
  { id: 'cactus', canonicalName: 'Cacti', aliases: ['cactus', 'cacti'], icon: '🌵' },
  { id: 'clover', canonicalName: 'Clover', aliases: ['clover'], icon: '☘️' },
  { id: 'lucky-clover', canonicalName: 'Four-leaf Clover', aliases: ['four leaf clover', 'four-leaf clover'], icon: '🍀' },
  { id: 'daisy', canonicalName: 'Daisies', aliases: ['daisy', 'daisies'], icon: '🌼' },
  { id: 'tulip', canonicalName: 'Tulips', aliases: ['tulip', 'tulips'], icon: '🌷' },
] as const;

export const CUSTOM_PLANT_ICON: PlantIconDefinition = {
  id: 'custom', canonicalName: 'Custom Plant', aliases: [], icon: '🪴',
};

export function normalizePlantName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

const byAlias = new Map<string, PlantIconDefinition>();
for (const definition of PLANT_ICON_REGISTRY) {
  for (const alias of [definition.canonicalName, ...definition.aliases]) {
    const key = normalizePlantName(alias);
    if (key && !byAlias.has(key)) byAlias.set(key, definition);
  }
}

export function findPlantIconByName(value: string): PlantIconDefinition | null {
  return byAlias.get(normalizePlantName(value)) ?? null;
}

export function findPlantIconByValue(icon: string | undefined | null): PlantIconDefinition | null {
  if (!icon) return null;
  return PLANT_ICON_REGISTRY.find((definition) => definition.icon === icon) ?? null;
}

export function getCanonicalPlantNameByIcon(iconId: string): string | null {
  return PLANT_ICON_REGISTRY.find((definition) => definition.id === iconId)?.canonicalName ?? null;
}

export function syncPlantName(value: string): { name: string; icon: string; iconId: string | null } {
  const known = findPlantIconByName(value);
  return { name: value, icon: known?.icon ?? CUSTOM_PLANT_ICON.icon, iconId: known?.id ?? null };
}

export function syncPlantIcon(iconId: string): { name: string; icon: string; iconId: string } | null {
  const known = PLANT_ICON_REGISTRY.find((definition) => definition.id === iconId);
  return known ? { name: known.canonicalName, icon: known.icon, iconId: known.id } : null;
}

export function plantAliasConflicts(): string[] {
  const owner = new Map<string, string>();
  const conflicts: string[] = [];
  for (const definition of PLANT_ICON_REGISTRY) {
    for (const alias of [definition.canonicalName, ...definition.aliases]) {
      const key = normalizePlantName(alias);
      const existing = owner.get(key);
      if (key && existing && existing !== definition.id) conflicts.push(key);
      else if (key) owner.set(key, definition.id);
    }
  }
  return [...new Set(conflicts)].sort();
}
