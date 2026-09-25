import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { db, transaction } from './db';
import { saveImage } from './media';

const ASSETS_DIR = path.resolve(process.env.SEED_ASSETS_DIR ?? 'src/assets');
const upload = async (file: string) => saveImage(await readFile(path.join(ASSETS_DIR, file)));

async function seedIfEmpty(): Promise<void> {
  const { count } = db().prepare('SELECT COUNT(*) AS count FROM terroirs').get() as { count: number };
  if (count > 0) return;

  const [mezyb, rocky, bottles, vineyard, sunset, vines, soil] = await Promise.all([
    upload('terroir-mezyb-placeholder.png'),
    upload('terroir-rocky-placeholder.png'),
    upload('wine-bottles-placeholder.png'),
    upload('video-vineyard-wide.png'),
    upload('video-sunset.png'),
    upload('video-vines.png'),
    upload('soil-grape-placeholder.png'),
  ]);

  transaction(() => {
    const terroir = db().prepare(`
      INSERT INTO terroirs (slug, name, location, description, image_id, image_alt, polygon, sort)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const mezybId = terroir.run(
      'mezyb', 'Мезыбь', 'Дивноморское · Геленджик',
      'Участок у подножия Маркотхского хребта. Здесь почва, высота и открытость склона создают собственный ритм созревания.',
      mezyb, 'Виноградник на известняковом склоне в Мезыби',
      JSON.stringify([[44.52, 38.105], [44.524, 38.142], [44.508, 38.166], [44.489, 38.151], [44.486, 38.118], [44.501, 38.098]]),
      10,
    ).lastInsertRowid;
    const rockyId = terroir.run(
      'rocky-shore', 'Скалистый берег', 'Варваровка · Анапа',
      'Виноградник в районе Варваровки. Рельеф и воздушные потоки формируют другое прочтение близости Чёрного моря.',
      rocky, 'Виноградные лозы на скалистом побережье',
      JSON.stringify([[44.845, 37.332], [44.853, 37.366], [44.837, 37.39], [44.816, 37.382], [44.811, 37.35], [44.827, 37.326]]),
      20,
    ).lastInsertRowid;

    const wine = db().prepare(`
      INSERT INTO wines (name, price, style, terroir_id, image_id, image_position, sort) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    wine.run('Северный склон', 3200, 'Красное · сухое', mezybId, bottles, 'left', 10);
    wine.run('Белый камень', 2800, 'Белое · сухое', mezybId, bottles, 'center', 20);
    wine.run('Береговой ветер', 3900, 'Красное · сухое', rockyId, bottles, 'right', 30);
    wine.run('Известняк', 4600, 'Белое · сухое', rockyId, bottles, 'center', 40);

    const item = db().prepare(`
      INSERT INTO journal (kind, title, description, duration, image_id, image_alt, sort) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    item.run('film', 'Земля формирует', 'Короткий фильм о том, как читают участок прежде, чем говорить о вкусе.', '04:20', vineyard, 'Виноградник у подножия гор', 10);
    item.run('film', 'Лоза запоминает', 'Сезон в винограднике глазами людей, которые каждый день работают с лозой.', '06:40', sunset, 'Закат над рельефом виноградника', 20);
    item.run('research', 'Море — один из факторов', 'Связи между побережьем, рельефом, движением воздуха и виноградником.', '8 минут', vines, 'Ряды виноградных лоз', 30);
    item.run('interview', 'Как читать участок', 'Разговор о данных, наблюдениях и границе между фактом и интерпретацией.', '12 минут', soil, 'Камень почвы и виноградная ягода', 40);
  });
}

let ready: Promise<void> | undefined;

/** Seeds initial content once per process; concurrent callers share one promise. */
export const ensureSeeded = () => (ready ??= seedIfEmpty());
