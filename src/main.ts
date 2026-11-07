import './ui/style.css';
import { startApp } from './ui/app';
import { startLevels } from './ui/levels';

const app = document.getElementById('app')!;
const nav = document.createElement('nav');
nav.className = 'modes';
const sandboxRoot = document.createElement('div');
const levelRoot = document.createElement('div');
app.append(nav, sandboxRoot, levelRoot);

type Mode = 'sandbox' | 'levels';
let mode: Mode = location.hash === '#levels' ? 'levels' : 'sandbox';
const tabs: Record<Mode, HTMLButtonElement> = {
  sandbox: document.createElement('button'),
  levels: document.createElement('button'),
};
tabs.sandbox.textContent = '샌드박스';
tabs.levels.textContent = '레벨 (중력)';
for (const m of ['sandbox', 'levels'] as Mode[]) {
  tabs[m].onclick = () => setMode(m);
  nav.append(tabs[m]);
}
function setMode(m: Mode) {
  mode = m;
  sandboxRoot.hidden = m !== 'sandbox';
  levelRoot.hidden = m !== 'levels';
  for (const k of ['sandbox', 'levels'] as Mode[]) tabs[k].classList.toggle('on', k === m);
  history.replaceState(null, '', m === 'levels' ? '#levels' : '#');
}

startApp(sandboxRoot, () => mode === 'sandbox');
startLevels(levelRoot, () => mode === 'levels');
setMode(mode);
