/* ============================================================
   data.js — база продуктов, приёмы, витамины, цели
   ============================================================
   Здесь только данные. Логика — в app.js.
   Чтобы добавить продукт — допиши строку в BASE_FOODS.
   ============================================================ */

const MEALS = [
  { id:'breakfast', emoji:'🍳', title:'Завтрак', time:'07:00', water:400,
    variants:[
      {id:'v1', name:'Яичный', items:[
        {id:'b1', n:'Яйца 3 шт', k:210, p:18, f:15, c:1},
        {id:'b2', n:'Овсянка 80 г', k:300, p:10, f:6, c:52},
        {id:'b3', n:'Банан 1 шт', k:105, p:1, f:0, c:27},
        {id:'b4', n:'Хлеб цельнозерновой 2 ломтика', k:140, p:6, f:2, c:26}
      ]},
      {id:'v2', name:'Творожный', items:[
        {id:'b5', n:'Творог 5% 200 г', k:242, p:36, f:10, c:6},
        {id:'b6', n:'Овсянка 60 г', k:225, p:8, f:4, c:39},
        {id:'b7', n:'Мёд 1 ст.л.', k:64, p:0, f:0, c:17},
        {id:'b8', n:'Грецкие орехи 20 г', k:131, p:3, f:13, c:3}
      ]}
    ]},
  { id:'snack1', emoji:'🥤', title:'Перекус №1', time:'10:00', water:400,
    variants:[
      {id:'v1', name:'Гейнер', items:[
        {id:'s1a', n:'Гейнер 1 порция', k:350, p:25, f:5, c:55},
        {id:'s1b', n:'Молоко 200 мл', k:120, p:6, f:6, c:10}
      ]},
      {id:'v2', name:'Банан + протеин', items:[
        {id:'s2a', n:'Банан 1 шт', k:105, p:1, f:0, c:27},
        {id:'s2b', n:'Протеин 1 скуп', k:120, p:24, f:1, c:3},
        {id:'s2c', n:'Молоко 200 мл', k:120, p:6, f:6, c:10}
      ]}
    ]},
  { id:'lunch', emoji:'🍚', title:'Обед', time:'13:00', water:500,
    variants:[
      {id:'v1', name:'Рис + курица', items:[
        {id:'l1a', n:'Рис 150 г (сухой)', k:520, p:11, f:1, c:115},
        {id:'l1b', n:'Куриная грудка 200 г', k:330, p:62, f:7, c:0},
        {id:'l1c', n:'Овощи салат 200 г', k:60, p:3, f:1, c:10},
        {id:'l1d', n:'Оливковое масло 1 ст.л.', k:120, p:0, f:14, c:0}
      ]},
      {id:'v2', name:'Гречка + рыба', items:[
        {id:'l2a', n:'Гречка 150 г (сухая)', k:510, p:19, f:5, c:105},
        {id:'l2b', n:'Рыба (минтай/треска) 250 г', k:205, p:45, f:2, c:0},
        {id:'l2c', n:'Овощи салат 200 г', k:60, p:3, f:1, c:10},
        {id:'l2d', n:'Оливковое масло 1 ст.л.', k:120, p:0, f:14, c:0}
      ]},
      {id:'v3', name:'Макароны + говядина', items:[
        {id:'l3a', n:'Макароны 150 г (сухие)', k:525, p:18, f:2, c:105},
        {id:'l3b', n:'Говядина 200 г', k:400, p:52, f:20, c:0},
        {id:'l3c', n:'Овощи салат 200 г', k:60, p:3, f:1, c:10},
        {id:'l3d', n:'Оливковое масло 1 ст.л.', k:120, p:0, f:14, c:0}
      ]}
    ]},
  { id:'snack2', emoji:'🍌', title:'Перекус №2', time:'16:30', water:400,
    variants:[
      {id:'v1', name:'Банан + протеин', items:[
        {id:'s3a', n:'Банан 1 шт', k:105, p:1, f:0, c:27},
        {id:'s3b', n:'Протеин 1 скуп', k:120, p:24, f:1, c:3}
      ]},
      {id:'v2', name:'Творог + орехи', items:[
        {id:'s4a', n:'Творог 5% 150 г', k:182, p:27, f:7, c:5},
        {id:'s4b', n:'Миндаль 20 г', k:120, p:4, f:10, c:4}
      ]}
    ]},
  { id:'dinner', emoji:'🍗', title:'Ужин', time:'19:30', water:500,
    variants:[
      {id:'v1', name:'Рыба + гречка', items:[
        {id:'d1a', n:'Рыба 250 г', k:205, p:45, f:2, c:0},
        {id:'d1b', n:'Гречка 120 г (сухая)', k:408, p:15, f:4, c:84},
        {id:'d1c', n:'Овощи 200 г', k:60, p:3, f:1, c:10}
      ]},
      {id:'v2', name:'Курица + рис', items:[
        {id:'d2a', n:'Куриная грудка 200 г', k:330, p:62, f:7, c:0},
        {id:'d2b', n:'Рис 120 г (сухой)', k:416, p:9, f:1, c:92},
        {id:'d2c', n:'Овощи 200 г', k:60, p:3, f:1, c:10}
      ]},
      {id:'v3', name:'Говядина + макароны', items:[
        {id:'d3a', n:'Говядина 180 г', k:360, p:47, f:18, c:0},
        {id:'d3b', n:'Макароны 120 г (сухие)', k:420, p:14, f:2, c:84},
        {id:'d3c', n:'Овощи 200 г', k:60, p:3, f:1, c:10}
      ]}
    ]},
  { id:'night', emoji:'🌙', title:'На ночь', time:'22:30', water:300,
    variants:[
      {id:'v1', name:'Творог + мёд', items:[
        {id:'n1a', n:'Творог 5% 200 г', k:242, p:36, f:10, c:6},
        {id:'n1b', n:'Мёд 1 ст.л.', k:64, p:0, f:0, c:17}
      ]},
      {id:'v2', name:'Кефир + творог', items:[
        {id:'n2a', n:'Кефир 1% 250 мл', k:100, p:8, f:3, c:10},
        {id:'n2b', n:'Творог 5% 150 г', k:182, p:27, f:7, c:5}
      ]}
    ]}
];

const VITAMINS = [
  {id:'d3',   n:'Витамин D3',  tag:'утро'},
  {id:'omega',n:'Омега-3',     tag:'утро'},
  {id:'multi',n:'Мультивитамины',tag:'утро'},
  {id:'magnesium',n:'Магний',  tag:'ночь'},
  {id:'zinc', n:'Цинк',        tag:'ночь'},
  {id:'creatine',n:'Креатин',  tag:'тренировка', creatine:true}
];

/* База продуктов. КБЖУ на 100 г, порция по умолчанию в граммах.
   Чтобы добавить продукт — допиши строку в этот массив. */
const BASE_FOODS = [
  {name:'Яйцо куриное', kcal:143, protein:13, fat:11, carbs:1, defaultPortion:50},
  {name:'Овсянка (сухая)', kcal:375, protein:12, fat:6, carbs:65, defaultPortion:80},
  {name:'Гречка (сухая)', kcal:340, protein:13, fat:3, carbs:70, defaultPortion:100},
  {name:'Рис (сухой)', kcal:345, protein:7, fat:1, carbs:78, defaultPortion:100},
  {name:'Макароны (сухие)', kcal:350, protein:12, fat:1.5, carbs:70, defaultPortion:100},
  {name:'Куриная грудка', kcal:165, protein:31, fat:3.5, carbs:0, defaultPortion:150},
  {name:'Говядина', kcal:200, protein:26, fat:10, carbs:0, defaultPortion:150},
  {name:'Рыба (треска/минтай)', kcal:82, protein:18, fat:1, carbs:0, defaultPortion:150},
  {name:'Творог 5%', kcal:121, protein:18, fat:5, carbs:3, defaultPortion:150},
  {name:'Кефир 1%', kcal:40, protein:3, fat:1, carbs:4, defaultPortion:200},
  {name:'Молоко 2.5%', kcal:60, protein:3, fat:2.5, carbs:5, defaultPortion:200},
  {name:'Банан', kcal:105, protein:1, fat:0, carbs:27, defaultPortion:120},
  {name:'Яблоко', kcal:52, protein:0.3, fat:0.2, carbs:14, defaultPortion:150},
  {name:'Мёд', kcal:320, protein:0, fat:0, carbs:82, defaultPortion:20, small:true},
  {name:'Грецкие орехи', kcal:654, protein:15, fat:65, carbs:14, defaultPortion:30, small:true},
  {name:'Миндаль', kcal:600, protein:21, fat:50, carbs:20, defaultPortion:30, small:true},
  {name:'Оливковое масло', kcal:900, protein:0, fat:100, carbs:0, defaultPortion:10, small:true},
  {name:'Хлеб цельнозерновой', kcal:250, protein:10, fat:4, carbs:45, defaultPortion:30, small:true},
  {name:'Картофель', kcal:77, protein:2, fat:0.1, carbs:17, defaultPortion:200},
  {name:'Овощи (салат)', kcal:30, protein:1.5, fat:0.5, carbs:5, defaultPortion:200},
  {name:'Протеин (скуп)', kcal:120, protein:24, fat:1, carbs:3, defaultPortion:30, small:true},
  {name:'Гейнер (порция)', kcal:350, protein:25, fat:5, carbs:55, defaultPortion:100},
  {name:'Сыр', kcal:350, protein:25, fat:27, carbs:2, defaultPortion:30, small:true},
  {name:'Сметана 15%', kcal:160, protein:2.5, fat:15, carbs:3, defaultPortion:30, small:true},
  {name:'Куриное бедро', kcal:185, protein:20, fat:11, carbs:0, defaultPortion:150},
  {name:'Индейка', kcal:150, protein:29, fat:3, carbs:0, defaultPortion:150},
  {name:'Свинина нежирная', kcal:250, protein:22, fat:18, carbs:0, defaultPortion:150},
  {name:'Фасоль (варёная)', kcal:120, protein:8, fat:0.5, carbs:21, defaultPortion:150},
  {name:'Чечевица (варёная)', kcal:116, protein:9, fat:0.4, carbs:20, defaultPortion:150},
  {name:'Изюм', kcal:300, protein:3, fat:0.5, carbs:79, defaultPortion:30, small:true},
  {name:'Арахисовая паста', kcal:590, protein:25, fat:50, carbs:20, defaultPortion:20, small:true},
  {name:'Рис (варёный)', kcal:130, protein:2.7, fat:0.3, carbs:28, defaultPortion:200},
  {name:'Гречка (варёная)', kcal:110, protein:4, fat:1, carbs:21, defaultPortion:200},
  {name:'Макароны (варёные)', kcal:130, protein:5, fat:1, carbs:25, defaultPortion:200},
  {name:'Овсянка (варёная)', kcal:90, protein:3, fat:1.5, carbs:15, defaultPortion:250},
  {name:'Картофельное пюре', kcal:90, protein:2, fat:3, carbs:14, defaultPortion:200},
  {name:'Тушёные овощи', kcal:60, protein:2, fat:3, carbs:6, defaultPortion:200},
  {name:'Куриное филе (готовое)', kcal:180, protein:30, fat:6, carbs:0, defaultPortion:150},
  {name:'Чай без сахара', kcal:0, protein:0, fat:0, carbs:0, defaultPortion:200},
  {name:'Чай с сахаром (1 ч.л.)', kcal:10, protein:0, fat:0, carbs:2.5, defaultPortion:200},
  {name:'Чай с мёдом (1 ч.л.)', kcal:13, protein:0, fat:0, carbs:3.5, defaultPortion:200},
  {name:'Кофе без сахара', kcal:2, protein:0.2, fat:0, carbs:0, defaultPortion:200},
  {name:'Кофе с молоком', kcal:20, protein:1, fat:1, carbs:2, defaultPortion:200},
  {name:'Сок апельсиновый', kcal:45, protein:0.7, fat:0.2, carbs:10, defaultPortion:200},
  {name:'Компот', kcal:30, protein:0.1, fat:0, carbs:7.5, defaultPortion:200}
];

const GOALS = {
  gain: { kTrain:3300, kRest:2700, pTrain:200, pRest:170, fTrain:90, fRest:80, cTrain:360, cRest:300, w:3500, label:'Набор массы' },
  keep: { kTrain:2800, kRest:2500, pTrain:160, pRest:140, fTrain:80,  fRest:70, cTrain:300, cRest:270, w:3000, label:'Поддержание' },
  cut:  { kTrain:2200, kRest:1900, pTrain:170, pRest:150, fTrain:60,  fRest:55, cTrain:200, cRest:170, w:3000, label:'Похудение' }
};