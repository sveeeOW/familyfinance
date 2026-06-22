// Базовые системные категории (§9.1) + правила автокатегоризации (§9.3).
// Используются и сервисом, и сидером.

export interface SystemCategoryDef {
  name: string;
  icon: string;
  color: string;
  // ключевые слова для автокатегоризации (нижний регистр)
  keywords?: string[];
}

export const SYSTEM_CATEGORIES: SystemCategoryDef[] = [
  { name: 'Жильё', icon: 'home', color: '#4F46E5', keywords: ['аренда', 'квартплата', 'жкх', 'жильё'] },
  { name: 'Коммунальные платежи', icon: 'bolt', color: '#0EA5E9', keywords: ['коммуналка', 'свет', 'газ', 'вода', 'электроэнергия', 'отопление'] },
  { name: 'Кредиты', icon: 'credit-card', color: '#DC2626', keywords: ['кредит', 'ипотека', 'займ', 'рассрочка'] },
  { name: 'Продукты', icon: 'shopping-cart', color: '#16A34A', keywords: ['пятёрочка', 'пятерочка', 'перекрёсток', 'перекресток', 'магнит', 'лента', 'ашан', 'вкусвилл', 'продукты', 'супермаркет', 'дикси'] },
  { name: 'Рестораны и кафе', icon: 'utensils', color: '#F59E0B', keywords: ['ресторан', 'кафе', 'бар', 'бургер', 'суши', 'пицца', 'кофейня', 'столовая'] },
  { name: 'Топливо', icon: 'gas-pump', color: '#EA580C', keywords: ['азс', 'топливо', 'бензин', 'лукойл', 'газпромнефть', 'роснефть', 'дизель'] },
  { name: 'Автомобиль', icon: 'car', color: '#475569', keywords: ['автосервис', 'шиномонтаж', 'запчасти', 'мойка', 'парковка'] },
  { name: 'Такси', icon: 'taxi', color: '#FACC15', keywords: ['такси', 'яндекс go', 'uber', 'ситимобил', 'индрайвер'] },
  { name: 'Общественный транспорт', icon: 'bus', color: '#0891B2', keywords: ['метро', 'автобус', 'троллейбус', 'тройка', 'проездной'] },
  { name: 'Медицина', icon: 'stethoscope', color: '#E11D48', keywords: ['клиника', 'врач', 'анализы', 'медцентр', 'стоматолог'] },
  { name: 'Аптеки', icon: 'pills', color: '#DB2777', keywords: ['аптека', 'лекарства', 'аптека.ру', 'горздрав'] },
  { name: 'Одежда', icon: 'shirt', color: '#9333EA', keywords: ['одежда', 'zara', 'hm', 'обувь', 'спортмастер'] },
  { name: 'Подписки', icon: 'repeat', color: '#7C3AED', keywords: ['подписка', 'netflix', 'spotify', 'яндекс плюс', 'кинопоиск', 'youtube premium', 'apple'] },
  { name: 'Связь и интернет', icon: 'wifi', color: '#2563EB', keywords: ['мтс', 'билайн', 'мегафон', 'теле2', 'ростелеком', 'интернет', 'связь'] },
  { name: 'Развлечения', icon: 'film', color: '#C026D3', keywords: ['кино', 'театр', 'концерт', 'развлечения', 'игры', 'steam'] },
  { name: 'Путешествия', icon: 'plane', color: '#0D9488', keywords: ['авиабилеты', 'отель', 'booking', 'aviasales', 'ржд', 'путешествие'] },
  { name: 'Образование', icon: 'graduation-cap', color: '#1D4ED8', keywords: ['курсы', 'обучение', 'школа', 'университет', 'репетитор'] },
  { name: 'Дети', icon: 'baby', color: '#F472B6', keywords: ['детский сад', 'игрушки', 'детское', 'школа', 'кружок'] },
  { name: 'Домашние животные', icon: 'paw', color: '#A16207', keywords: ['зоомагазин', 'корм', 'ветеринар', 'кошка', 'собака', 'petshop'] },
  { name: 'Подарки', icon: 'gift', color: '#BE123C', keywords: ['подарок', 'цветы', 'сувенир'] },
  { name: 'Налоги', icon: 'landmark', color: '#334155', keywords: ['налог', 'фнс', 'штраф', 'госуслуги', 'пошлина'] },
  { name: 'Инвестиции', icon: 'chart-line', color: '#059669', keywords: ['брокер', 'акции', 'инвестиции', 'тинькофф инвестиции'] },
  { name: 'Маркетплейсы', icon: 'box', color: '#7E22CE', keywords: ['ozon', 'wildberries', 'wb', 'яндекс маркет', 'aliexpress', 'мегамаркет'] },
  { name: 'Другое', icon: 'ellipsis', color: '#6B7280', keywords: [] },
];
