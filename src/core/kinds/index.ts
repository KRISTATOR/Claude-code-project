import {
  blockKind,
  characterKind,
  characterProfileKind,
  definitionKind,
  factionKind,
  npcAppearanceKind,
  npcKind,
  phaseKind,
  relationshipKind,
  sheetTemplateKind,
} from './characters';
import {
  archiveKind,
  archivePartKind,
  diaryDesignKind,
  formTemplateKind,
  locationSignKind,
  printJobKind,
  propDocumentKind,
  writerProfileKind,
} from './documents';
import {
  currencyKind,
  inventoryItemKind,
  itemKind,
  lootTableKind,
  recipeKind,
  transferKind,
} from './economy';
import { fileKind } from './file';
import { folderKind } from './folder';
import { gameKind } from './game';
import {
  beatKind,
  canonEntryKind,
  clueKind,
  glossaryTermKind,
  historyEventKind,
  hookKind,
  issueKind,
  pageKind,
  plotThreadKind,
  questKind,
  ruleSectionKind,
  rulebookKind,
  rulebookVersionKind,
} from './lore';
import {
  budgetLineKind,
  dishKind,
  equipmentListKind,
  ingredientKind,
  mealKind,
  noteKind,
  surveyKind,
  taskKind,
} from './logistics';
import type { KindDefinition } from './registry';
import { mapKind, mapLayerKind, sleepingPlanKind, travelRouteKind } from './maps';
import { worldKind } from './world';

export { fileKind, folderKind, gameKind, worldKind };
export * from './characters';
export * from './lore';
export * from './documents';
export * from './economy';
export * from './maps';
export * from './logistics';
export { gameStatuses, type GameStatus } from './game';
export { readData, readSecret, type KindDefinition } from './registry';

export const kinds: Record<string, KindDefinition> = {
  [worldKind.kind]: worldKind,
  [gameKind.kind]: gameKind,
  [folderKind.kind]: folderKind,
  [fileKind.kind]: fileKind,
  [sheetTemplateKind.kind]: sheetTemplateKind,
  [characterKind.kind]: characterKind,
  [characterProfileKind.kind]: characterProfileKind,
  [factionKind.kind]: factionKind,
  [relationshipKind.kind]: relationshipKind,
  [npcKind.kind]: npcKind,
  [npcAppearanceKind.kind]: npcAppearanceKind,
  [phaseKind.kind]: phaseKind,
  [blockKind.kind]: blockKind,
  [definitionKind.kind]: definitionKind,
  [pageKind.kind]: pageKind,
  [canonEntryKind.kind]: canonEntryKind,
  [historyEventKind.kind]: historyEventKind,
  [beatKind.kind]: beatKind,
  [plotThreadKind.kind]: plotThreadKind,
  [clueKind.kind]: clueKind,
  [questKind.kind]: questKind,
  [hookKind.kind]: hookKind,
  [issueKind.kind]: issueKind,
  [rulebookKind.kind]: rulebookKind,
  [ruleSectionKind.kind]: ruleSectionKind,
  [glossaryTermKind.kind]: glossaryTermKind,
  [rulebookVersionKind.kind]: rulebookVersionKind,
  [propDocumentKind.kind]: propDocumentKind,
  [writerProfileKind.kind]: writerProfileKind,
  [formTemplateKind.kind]: formTemplateKind,
  [locationSignKind.kind]: locationSignKind,
  [diaryDesignKind.kind]: diaryDesignKind,
  [archiveKind.kind]: archiveKind,
  [archivePartKind.kind]: archivePartKind,
  [printJobKind.kind]: printJobKind,
  [itemKind.kind]: itemKind,
  [currencyKind.kind]: currencyKind,
  [transferKind.kind]: transferKind,
  [recipeKind.kind]: recipeKind,
  [lootTableKind.kind]: lootTableKind,
  [inventoryItemKind.kind]: inventoryItemKind,
  [mapKind.kind]: mapKind,
  [mapLayerKind.kind]: mapLayerKind,
  [travelRouteKind.kind]: travelRouteKind,
  [sleepingPlanKind.kind]: sleepingPlanKind,
  [ingredientKind.kind]: ingredientKind,
  [dishKind.kind]: dishKind,
  [mealKind.kind]: mealKind,
  [budgetLineKind.kind]: budgetLineKind,
  [equipmentListKind.kind]: equipmentListKind,
  [taskKind.kind]: taskKind,
  [noteKind.kind]: noteKind,
  [surveyKind.kind]: surveyKind,
};
