// Carta del restaurante transcrita de las dos fotografías facilitadas por el propietario.
const product = (name: string, pesos: number, description = "") => ({ name, description, price: pesos * 100 });
const meats = "Carne a elección: filete de pechuga, cañón de cerdo, chicharrón o res. Indica tu elección en la nota del pedido.";
const grill = "Acompañado de ensalada de la casa, papa al vapor o a la francesa, arepa y chimichurri argentino. Indica tu elección de papa en la nota.";
const fish = "Acompañado de arroz de coco, ensalada, patacón, arepa y consomé.";
const sides = "Arroz, ensalada, aguacate, banano y arepa.";

export const RESTAURANT_MENU = [
  { name: "Desayunos · de 8 a 11 a. m.", products: [
    product("Desayuno especial", 25000, `Calentado de frijoles con arroz, huevos revueltos o fritos, tajada, quesito, arepa y chocolate en agua o leche. ${meats}`),
    product("Calentado con huevo", 18000, "Calentado de frijoles con arroz, huevos revueltos o fritos, quesito, arepa y chocolate."),
    product("Arepa con carne", 18000, `Quesito, arepa y chocolate. ${meats}`),
    product("Huevos al gusto", 14000, "Quesito, arepa y chocolate. Indica cómo prefieres los huevos en la nota."),
    product("Arepa de chócolo", 12000, "Quesito y chocolate."),
  ] },
  { name: "Menú infantil", products: [
    product("Nuggets de pollo", 24000, "Con papas a la francesa y jugo Hit en cajita."),
    product("Salchipapa", 20000, "Con papas a la francesa y jugo Hit en cajita."),
  ] },
  { name: "Bandejas", products: [
    product("Bandeja paisa", 40000, "Chicharrón, chorizo, carne molida, morcilla, huevo, frijoles, arroz, ensalada, aguacate, tajada y arepa."),
    product("Bandeja Ay mi madre", 28000, `Frijoles, arroz, ensalada, tajada, arepa, huevo y bebida guandolo. ${meats}`),
  ] },
  { name: "Recomendados", products: [
    product("Sancocho trifásico", 38000, `Morrillo, espinazo y pollo. ${sides}`),
    product("Cazuela de frijol", 35000, "Trozos de chicharrón, chorizo, carne molida, maduro, ripio de papa, aguacate, arroz y arepa."),
    product("Sobrebarriga sudada", 35000, "Papa, yuca, arroz, ensalada, aguacate, banano y arepa."),
    product("Fiambre en hoja de viao", 35000, "Chicharrón, chorizo, carne molida, huevo cocido, tajada de maduro, arroz, migote de papa y arepa."),
    product("Mondongo", 35000, sides),
    product("Ajiaco", 32000, sides),
  ] },
  { name: "Parrilla", products: [
    product("Costillas", 45000, `Centro de costilla de 500 g en salsa BBQ de la casa. ${grill}`),
    product("Punta de anca", 48000, `Jugoso corte de anca de 300 g. ${grill}`),
    product("Churrasco", 48000, `Corte medio de chata de 300 g. ${grill}`),
    product("Cañón a la parrilla", 35000, `Corte medio de cañón de 300 g. ${grill}`),
    product("Cañón en salsa de champiñones", 40000, `Corte medio de cañón de 300 g. ${grill}`),
    product("Pechuga a la parrilla", 35000, `Corte de pechuga de 300 g. ${grill}`),
    product("Pechuga en salsa de champiñones", 40000, `Corte de pechuga de 300 g. ${grill}`),
  ] },
  { name: "Pescados", products: [product("Trucha", 42000, fish), product("Tilapia", 38000, fish)] },
  { name: "Entradas", products: [
    product("Patacón con hogao y guacamole · 8 personas", 24000),
    product("Patacón con hogao y guacamole · 4 personas", 12000),
    product("Empanaditas con ají · 8 personas", 20000),
    product("Empanaditas con ají · 4 personas", 10000),
  ] },
  { name: "Limonadas", products: [
    product("Limonada de hierbabuena", 9500), product("Limonada de coco", 9500),
    product("Limonada de cereza", 9500), product("Limonada natural", 7500),
  ] },
  { name: "Jugos naturales", products: [
    product("Jugo natural en leche", 9000, "Sabores: guanábana, maracuyá, mango, mora, mandarina o tamarindo. Indica el sabor en la nota."),
    product("Jugo natural en agua", 8000, "Sabores: guanábana, maracuyá, mango, mora, mandarina o tamarindo. Indica el sabor en la nota."),
    product("Jarra de guandolo", 20000), product("Vaso de guandolo", 5000),
  ] },
  { name: "Cervezas", products: [
    product("Jarra de refajo", 26000), product("Corona", 10000), product("Coronita", 8000),
    product("Heineken", 8000), product("3 Cordilleras", 9000), product("Club Colombia", 7000),
    product("Águila Light", 7000), product("Águila", 6000), product("Pilsen", 6000),
    product("Poker", 6000), product("Vaso michelado", 3000),
  ] },
  { name: "Bebidas", products: [
    product("Milo frío", 9000), product("Té Hatsu", 8000), product("Gatorade", 7000),
    product("Mr. Tea", 6000), product("Jugos Hit", 6000), product("H2O", 5000),
    product("Coca-Cola", 5000), product("Gaseosa Postobón", 5000), product("Botella de agua", 4000),
    product("Soda", 5000), product("Mazamorra", 6500), product("Claro", 4500),
  ] },
];
