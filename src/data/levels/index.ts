/// <reference types="vite/client" />
/**
 * 레벨 목록. 이 폴더의 *.json 을 파일 이름 순서대로 불러온다 (01-..., 02-...).
 * 에디터에서 내려받은 JSON 을 여기에 넣으면 목록에 들어간다.
 */
import { parseLevel, type Level } from '../../core/level';

const files = import.meta.glob('./*.json', { eager: true, import: 'default' });

export const LEVELS: Level[] = Object.keys(files)
  .sort()
  .map((f) => {
    try {
      return parseLevel(files[f]);
    } catch (e) {
      throw new Error(`${f}: ${(e as Error).message}`);
    }
  });
