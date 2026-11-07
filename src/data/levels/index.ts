import type { Level } from '../../core/level';
import { splitter } from './01-splitter';
import { oneTimeDoor } from './02-one-time-door';

/** 레벨 선택 화면에 나오는 순서 */
export const LEVELS: Level[] = [splitter, oneTimeDoor];
