// Mapeo completo de animales de Mega Animalitos
// Basado en https://juegoactivo.com/jugar/mega-animalitos

const animalMapping = {
    // Números y colores de cada animal
    0: {
        name: "Delfín",
        color: "green",
        lotteryNumber: "0"
    },
    1: {
        name: "Carnero", 
        color: "red",
        lotteryNumber: "1"
    },
    2: {
        name: "Toro",
        color: "black", 
        lotteryNumber: "2"
    },
    3: {
        name: "Ciempies",
        color: "red",
        lotteryNumber: "3"
    },
    4: {
        name: "Alacran",
        color: "black",
        lotteryNumber: "4"
    },
    5: {
        name: "León",
        color: "red",
        lotteryNumber: "5"
    },
    6: {
        name: "Rana",
        color: "black",
        lotteryNumber: "6"
    },
    7: {
        name: "Perico",
        color: "red",
        lotteryNumber: "7"
    },
    8: {
        name: "Ratón",
        color: "black",
        lotteryNumber: "8"
    },
    9: {
        name: "Aguila",
        color: "red",
        lotteryNumber: "9"
    },
    10: {
        name: "Tigre",
        color: "black",
        lotteryNumber: "10"
    },
    11: {
        name: "Gato",
        color: "black",
        lotteryNumber: "11"
    },
    12: {
        name: "Caballo",
        color: "red",
        lotteryNumber: "12"
    },
    13: {
        name: "Mono",
        color: "black",
        lotteryNumber: "13"
    },
    14: {
        name: "Paloma",
        color: "red",
        lotteryNumber: "14"
    },
    15: {
        name: "Zorro",
        color: "black",
        lotteryNumber: "15"
    },
    16: {
        name: "Oso",
        color: "red",
        lotteryNumber: "16"
    },
    17: {
        name: "Pavo",
        color: "black",
        lotteryNumber: "17"
    },
    18: {
        name: "Burro",
        color: "red",
        lotteryNumber: "18"
    },
    19: {
        name: "Chivo",
        color: "red",
        lotteryNumber: "19"
    },
    20: {
        name: "Cochino",
        color: "black",
        lotteryNumber: "20"
    },
    21: {
        name: "Gallo",
        color: "red",
        lotteryNumber: "21"
    },
    22: {
        name: "Camello",
        color: "black",
        lotteryNumber: "22"
    },
    23: {
        name: "Cebra",
        color: "red",
        lotteryNumber: "23"
    },
    24: {
        name: "Iguana",
        color: "black",
        lotteryNumber: "24"
    },
    25: {
        name: "Gallina",
        color: "red",
        lotteryNumber: "25"
    },
    26: {
        name: "Vaca",
        color: "black",
        lotteryNumber: "26"
    },
    27: {
        name: "Perro",
        color: "red",
        lotteryNumber: "27"
    },
    28: {
        name: "Zamuro",
        color: "black",
        lotteryNumber: "28"
    },
    29: {
        name: "Elefante",
        color: "black",
        lotteryNumber: "29"
    },
    30: {
        name: "Caiman",
        color: "red",
        lotteryNumber: "30"
    },
    31: {
        name: "Lapa",
        color: "black",
        lotteryNumber: "31"
    },
    32: {
        name: "Ardilla",
        color: "red",
        lotteryNumber: "32"
    },
    33: {
        name: "Pescado",
        color: "black",
        lotteryNumber: "33"
    },
    34: {
        name: "Venado",
        color: "red",
        lotteryNumber: "34"
    },
    35: {
        name: "Jirafa",
        color: "black",
        lotteryNumber: "35"
    },
    36: {
        name: "Culebra",
        color: "red",
        lotteryNumber: "36"
    },
    37: {
        name: "Ballena",
        color: "green",
        lotteryNumber: "00"
    }
};

// Funciones de utilidad
function getAnimalByNumber(number) {
    return animalMapping[number] || null;
}

function getAnimalByName(name) {
    for (const [num, animal] of Object.entries(animalMapping)) {
        if (animal.name.toLowerCase() === name.toLowerCase()) {
            return { number: parseInt(num), ...animal };
        }
    }
    return null;
}

function getAnimalsByColor(color) {
    const animals = [];
    for (const [num, animal] of Object.entries(animalMapping)) {
        if (animal.color === color) {
            animals.push({ number: parseInt(num), ...animal });
        }
    }
    return animals;
}

function getColorStats() {
    const stats = { red: 0, black: 0, green: 0 };
    for (const animal of Object.values(animalMapping)) {
        stats[animal.color]++;
    }
    return stats;
}

// Exportar el mapeo y funciones
module.exports = {
    animalMapping,
    getAnimalByNumber,
    getAnimalByName,
    getAnimalsByColor,
    getColorStats
};

// Mostrar estadísticas al ejecutar directamente
if (require.main === module) {
    console.log('🐾 MAPEO COMPLETO DE ANIMALITOS');
    console.log('=' .repeat(50));
    
    const stats = getColorStats();
    console.log(`📊 Total de animales: ${Object.keys(animalMapping).length}`);
    console.log(`🔴 Rojos: ${stats.red}`);
    console.log(`⚫ Negros: ${stats.black}`);
    console.log(`🟢 Verdes: ${stats.green}`);
    
    console.log('\n🎯 ANIMALES POR COLOR:');
    console.log('\n🔴 ROJOS:');
    getAnimalsByColor('red').forEach(animal => {
        console.log(`   ${animal.lotteryNumber.padStart(2, '0')} - ${animal.name}`);
    });
    
    console.log('\n⚫ NEGROS:');
    getAnimalsByColor('black').forEach(animal => {
        console.log(`   ${animal.lotteryNumber.padStart(2, '0')} - ${animal.name}`);
    });
    
    console.log('\n🟢 VERDES:');
    getAnimalsByColor('green').forEach(animal => {
        console.log(`   ${animal.lotteryNumber.padStart(2, '0')} - ${animal.name}`);
    });
}
