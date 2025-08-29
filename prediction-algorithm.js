const fs = require('fs');
const DatabaseManager = require('./database');

class DynamicPredictionAlgorithm {
    constructor() {
        this.data = null;
        this.allResults = [];
        this.db = new DatabaseManager();
        
        // Mapeo de animales
        this.animals = {
            0: "Delfín", 1: "Carnero", 2: "Toro", 3: "Ciempies", 4: "Alacran",
            5: "León", 6: "Rana", 7: "Perico", 8: "Ratón", 9: "Aguila",
            10: "Tigre", 11: "Gato", 12: "Caballo", 13: "Mono", 14: "Paloma",
            15: "Zorro", 16: "Oso", 17: "Pavo", 18: "Burro", 19: "Chivo",
            20: "Cochino", 21: "Gallo", 22: "Camello", 23: "Cebra", 24: "Iguana",
            25: "Gallina", 26: "Vaca", 27: "Perro", 28: "Zamuro", 29: "Elefante",
            30: "Caiman", 31: "Lapa", 32: "Ardilla", 33: "Pescado", 34: "Venado",
            35: "Jirafa", 36: "Culebra", 37: "Ballena"
        };
        
        // Lista de animales repetidores conocidos
        this.animalesRepetidores = [3, 2, 1, 4, 28, 31]; // Repetidores reales (removido 37 Ballena)
        this.animalesRepetidoresModerados = [22, 32, 35]; // Repetidores moderados (removido 0 Delfín)
        
        this.colorMap = {
            0: "green", 1: "red", 2: "black", 3: "red", 4: "black",
            5: "red", 6: "black", 7: "red", 8: "black", 9: "red",
            10: "black", 11: "black", 12: "red", 13: "black", 14: "red",
            15: "black", 16: "red", 17: "black", 18: "red", 19: "red",
            20: "black", 21: "red", 22: "black", 23: "red", 24: "black",
            25: "red", 26: "black", 27: "red", 28: "black", 29: "black",
            30: "red", 31: "black", 32: "red", 33: "black", 34: "red",
            35: "black", 36: "red", 37: "green"
        };

        // Historial de precisión
        this.accuracyHistory = {
            total: 0,
            hits: 0,
            accuracy: 0
        };

        // Sistema de temperatura simple
        this.temperatureSystem = {
            hotAnimals: [],
            warmAnimals: [],
            coldAnimals: []
        };
    }

    // Cargar datos
    async loadData() {
        try {
            // Intentar cargar desde MongoDB primero
            try {
                await this.db.connect();
                const results = await this.db.getResults(); // Cargar TODOS los resultados sin límite
                this.allResults = results;
                console.log(`📊 Datos cargados desde MongoDB: ${this.allResults.length} resultados únicos`);
                return true;
            } catch (mongoError) {
                console.error('❌ Error cargando desde MongoDB, intentando JSON:', mongoError.message);
                return this.loadDataFromJSON();
            }
        } catch (error) {
            console.error('❌ Error general cargando datos:', error);
            return this.loadDataFromJSON();
        }
    }

    // Método de respaldo para cargar desde JSON
    loadDataFromJSON() {
        try {
            if (fs.existsSync('mega_animalitos_daily.json')) {
                const data = fs.readFileSync('mega_animalitos_daily.json', 'utf8');
                const parsedData = JSON.parse(data);
                this.allResults = Array.isArray(parsedData) ? parsedData : (parsedData.results || []);
                
                // Eliminar duplicados
                const uniqueResults = [];
                const seen = new Set();
                for (const result of this.allResults) {
                    const key = `${result.timeStr}-${result.number}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        uniqueResults.push(result);
                    }
                }
                this.allResults = uniqueResults;
                
                console.log(`📊 Datos cargados desde JSON: ${this.allResults.length} resultados únicos`);
                return true;
            } else {
                console.log('⚠️ No se encontró archivo de datos');
                return false;
            }
        } catch (error) {
            console.error('❌ Error cargando datos desde JSON:', error);
            return false;
        }
    }

    // ALGORITMO OPTIMIZADO - ENFOQUE DE MOMENTUM
    generatePredictions() {
        if (this.allResults.length < 10) {
            console.log('⚠️ No hay suficientes datos para predicciones');
        return {
                predictions: [], 
                colorPrediction: { color: 'black', probability: 50 },
            analysis: {
                    dynamicTemperature: {
                        hotAnimals: [],
                        warmAnimals: [],
                        coldAnimals: []
                    }
                }
            };
        }

        console.log('🎯 Generando predicciones con algoritmo de MOMENTUM...');
        
        // Analizar últimos 100 resultados (más recientes)
        const recentResults = this.allResults.slice(0, 100);
        const animalStats = this.analyzeAnimals(recentResults);
        
        // Calcular scores con lógica más agresiva
        const animalScores = this.calculateAggressiveScores(animalStats, recentResults);
        
        // Filtrar animales recientes (solo último 1 - menos restrictivo)
        const recentAnimals = recentResults.slice(0, 1).map(r => r.number);
        const filteredScores = Object.values(animalScores).filter(animal => 
            !recentAnimals.includes(animal.number)
        );

        // Predicción de color más agresiva (ANTES de finalizar predicciones)
        const colorPrediction = this.predictAggressiveColor(recentResults);

        // SINCRONIZACIÓN COLOR-ANIMALES: Distribución balanceada según color dominante
        console.log(`🎨 Color predicho: ${colorPrediction.color} → Distribuyendo animales balanceadamente`);
        
        // Separar animales por color
        const animalsByColor = {
            black: [],
            red: [],
            green: []
        };
        
        filteredScores.forEach(animal => {
            const color = this.colorMap[animal.number];
            animalsByColor[color].push(animal);
        });
        
        // Ordenar cada grupo por score
        Object.keys(animalsByColor).forEach(color => {
            animalsByColor[color].sort((a, b) => b.score - a.score);
        });
        
        let finalPredictions = [];
        
        if (colorPrediction.color === 'green') {
            // Si predice verde: incluir los 2 animales verdes + distribuir el resto
            console.log('🟢 Distribución para VERDE: 2 verdes + 8 balanceados');
            
            // Agregar los 2 animales verdes (Delfín y Ballena)
            finalPredictions.push(...animalsByColor.green.slice(0, 2));
            
            // Distribuir los 8 restantes balanceadamente entre rojo y negro
            const remainingBlack = animalsByColor.black.slice(0, 4); // 4 negros
            const remainingRed = animalsByColor.red.slice(0, 4);     // 4 rojos
            
            finalPredictions.push(...remainingBlack, ...remainingRed);
            
        } else if (colorPrediction.color === 'black') {
            // Si predice negro: máximo 6 negros + 4 rojos
            console.log('⚫ Distribución para NEGRO: 6 negros + 4 rojos');
            
            const dominantColor = animalsByColor.black.slice(0, 6);  // Máximo 6 negros
            const otherColor = animalsByColor.red.slice(0, 4);       // 4 rojos
            
            finalPredictions.push(...dominantColor, ...otherColor);
            
        } else if (colorPrediction.color === 'red') {
            // Si predice rojo: máximo 6 rojos + 4 negros
            console.log('🔴 Distribución para ROJO: 6 rojos + 4 negros');
            
            const dominantColor = animalsByColor.red.slice(0, 6);    // Máximo 6 rojos
            const otherColor = animalsByColor.black.slice(0, 4);     // 4 negros
            
            finalPredictions.push(...dominantColor, ...otherColor);
        }
        
        // Ordenar por score final y tomar los primeros 10
        finalPredictions = finalPredictions
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);

        // Actualizar sistema de temperatura
        this.updateTemperatureSystem(animalStats);

        console.log(`🎯 Predicciones generadas: ${finalPredictions.length} animales`);
        console.log(`🎨 Color predicho: ${colorPrediction.color} (${colorPrediction.probability}%)`);
        
        // Mostrar distribución final
        const finalDistribution = {
            black: finalPredictions.filter(p => this.colorMap[p.number] === 'black').length,
            red: finalPredictions.filter(p => this.colorMap[p.number] === 'red').length,
            green: finalPredictions.filter(p => this.colorMap[p.number] === 'green').length
        };
        console.log(`📊 Distribución final: ${finalDistribution.black} negros, ${finalDistribution.red} rojos, ${finalDistribution.green} verdes`);
                    
        return {
            predictions: finalPredictions,
            colorPrediction: colorPrediction,
            analysis: {
                dynamicTemperature: this.temperatureSystem
            },
            metadata: {
                totalResults: this.allResults.length,
                lastUpdate: new Date().toISOString()
            }
        };
    }

    // Analizar estadísticas de animales
    analyzeAnimals(recentResults) {
        const stats = {};
        
        for (let animalNumber = 0; animalNumber <= 37; animalNumber++) {
            const appearances = recentResults.filter(r => r.number === animalNumber);
            const lastSeen = recentResults.findIndex(r => r.number === animalNumber);
            
            stats[animalNumber] = {
                frequency: appearances.length,
                lastSeen: lastSeen === -1 ? recentResults.length : lastSeen,
                percentage: (appearances.length / recentResults.length) * 100
            };
        }
        
        return stats;
    }

    // Calcular scores con SISTEMA DE MOMENTUM SIMPLIFICADO
    calculateAggressiveScores(animalStats, recentResults) {
        const scores = {};
        
        for (let animalNumber = 0; animalNumber <= 37; animalNumber++) {
            const stats = animalStats[animalNumber];
            let score = 0;
            
            // FACTOR 1: FRECUENCIA RECIENTE (50% del peso) - SIMPLIFICADO
            if (this.animalesRepetidores.includes(animalNumber)) {
                // Animales repetidores - LÓGICA MÁS AGRESIVA
                if (stats.frequency >= 3) {
                    score += 120; // MUY CALIENTE
                } else if (stats.frequency >= 2) {
                    score += 80; // CALIENTE
                } else if (stats.frequency === 1) {
                    score += 40; // TIBIO
                } else {
                    score -= 10; // Está "frío" - penalización LEVE (reducida)
                }
            } else if (this.animalesRepetidoresModerados.includes(animalNumber)) {
                // Animales repetidores moderados - BONUS MODERADO POR FRECUENCIA
                if (stats.frequency >= 3) {
                    score += 70; // Está "caliente"
                } else if (stats.frequency >= 2) {
                    score += 40; // Momentum moderado
                } else if (stats.frequency === 1) {
                    score += 15; // Momentum leve
                } else {
                    score -= 15; // Está "frío" - penalización LEVE (reducida)
                }
            } else {
                // Animales normales - LÓGICA DE MOMENTUM BALANCEADA
                if (stats.frequency >= 3) {
                    score += 60; // Está "caliente" - probable
                } else if (stats.frequency >= 2) {
                    score += 30; // Momentum moderado
                } else if (stats.frequency === 1) {
                    score += 10; // Momentum leve
                } else {
                    score -= 20; // Está "frío" - penalización MODERADA (reducida de -50)
                }
            }
            
            // FACTOR 2: RACHAS CALIENTES - Aparición reciente (25% del peso)
            const hotStreakBonus = this.calculateHotStreakBonus(animalNumber, recentResults);
            score += hotStreakBonus;
            
            // FACTOR 3: DEUDA ACUMULADA - Oportunidad para animales fríos (25% del peso)
            const debtBonus = this.calculateDebtBonus(animalNumber, recentResults);
            score += debtBonus;
            
            // FACTOR 4: ROTACIÓN DINÁMICA - Fuerza variabilidad (15% del peso)
            const rotationBonus = this.calculateRotationBonus(animalNumber, recentResults);
            score += rotationBonus;
            
            scores[animalNumber] = {
                number: animalNumber,
                animal: this.animals[animalNumber],
                score: score,
                color: this.colorMap[animalNumber],
                frequency: stats.frequency,
                lastSeen: stats.lastSeen,
                percentage: stats.percentage.toFixed(1),
                confidence: Math.max(0, Math.min(100, (score + 200) / 4))
            };
        }
        
        return scores;
    }

    // Analizar patrón de repetición
    analyzeRepetitionPattern(animalNumber, recentResults) {
        const allResults = this.allResults.slice(0, 80);
        const animalAppearances = allResults.filter(r => r.number === animalNumber);
        
        if (animalAppearances.length < 2) return 0;
        
        // Calcular intervalos entre apariciones
        const intervals = [];
        for (let i = 1; i < animalAppearances.length; i++) {
            const currentIndex = allResults.findIndex(r => r === animalAppearances[i]);
            const previousIndex = allResults.findIndex(r => r === animalAppearances[i-1]);
            intervals.push(currentIndex - previousIndex);
        }
        
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const lastAppearance = allResults.findIndex(r => r.number === animalNumber);
        
        // Solo dar bonus si ha pasado mucho tiempo, sin penalizar recientes
        if (lastAppearance > avgInterval * 1.5) {
            return 10; // Bonus por estar muy "atrasado"
        } else if (lastAppearance > avgInterval * 1.2) {
            return 5; // Bonus moderado por estar "atrasado"
        }
        
        return 0; // Sin penalización para animales recientes
    }

    // Calcular bonus por RACHAS CALIENTES - Sistema moderado
    calculateHotStreakBonus(animalNumber, recentResults) {
        // Buscar las últimas 20 apariciones para detectar rachas
        const last20Results = recentResults.slice(0, 20);
        const lastAppearanceIndex = last20Results.findIndex(r => r.number === animalNumber);
        
        if (lastAppearanceIndex === -1) {
            // No ha aparecido en los últimos 20 - NEUTRAL (no penalizar)
            return 0;
        }
        
        // BONUS MODERADO por aparición reciente
        if (lastAppearanceIndex <= 2) {
            return 60; // Apareció en los últimos 3 resultados - MUY CALIENTE
        } else if (lastAppearanceIndex <= 5) {
            return 45; // Apareció en los últimos 6 resultados - CALIENTE
        } else if (lastAppearanceIndex <= 10) {
            return 30; // Apareció en los últimos 11 resultados - TIBIO
        } else if (lastAppearanceIndex <= 15) {
            return 15; // Apareció en los últimos 16 resultados - TEMPLADO
        } else {
            return 5; // Apareció hace tiempo - LEVE
        }
    }

    // Calcular DEUDA ACUMULADA - Oportunidad para animales fríos
    calculateDebtBonus(animalNumber, recentResults) {
        // Buscar cuándo fue la última aparición en TODO el historial
        const lastAppearanceIndex = this.allResults.findIndex(r => r.number === animalNumber);
        
        if (lastAppearanceIndex === -1) {
            // NUNCA ha aparecido en el historial - MÁXIMA DEUDA
            return 150; // AUMENTADO
        }
        
        // Calcular "deuda" basada en tiempo sin aparecer - MÁS AGRESIVO
        if (lastAppearanceIndex >= 80) {
            return 120; // DEUDA MUY ALTA - AUMENTADO
        } else if (lastAppearanceIndex >= 60) {
            return 100; // DEUDA ALTA - AUMENTADO
        } else if (lastAppearanceIndex >= 40) {
            return 80; // DEUDA MODERADA-ALTA - AUMENTADO
        } else if (lastAppearanceIndex >= 25) {
            return 60; // DEUDA MODERADA - AUMENTADO
        } else if (lastAppearanceIndex >= 15) {
            return 40; // DEUDA LEVE - AUMENTADO
        } else if (lastAppearanceIndex >= 8) {
            return 20; // DEUDA MÍNIMA - AUMENTADO
        } else {
            return 0; // Apareció recientemente - SIN DEUDA
        }
    }

    // Calcular ROTACIÓN DINÁMICA - Fuerza variabilidad
    calculateRotationBonus(animalNumber, recentResults) {
        // Crear "ciclos de rotación" basados en tiempo
        const currentTime = new Date();
        const timeBasedSeed = Math.floor(currentTime.getTime() / (1000 * 60 * 10)); // Cambia cada 10 minutos
        
        // Usar el número del animal y tiempo para crear variabilidad predecible pero rotativa
        const rotationValue = ((animalNumber * 17 + timeBasedSeed * 23) % 100);
        
        // Crear bonus/penalización rotativa
        if (rotationValue < 20) {
            return 50; // 20% chance de bonus alto
        } else if (rotationValue < 40) {
            return 25; // 20% chance de bonus moderado
        } else if (rotationValue < 60) {
            return 0; // 20% chance neutral
        } else if (rotationValue < 80) {
            return -15; // 20% chance penalización leve
        } else {
            return -30; // 20% chance penalización moderada
        }
    }

    // Calcular bonus basado en tiempo (ciclos)
    calculateTimeBasedBonus(animalNumber, recentResults) {
        // Buscar la última aparición del animal
        const lastAppearance = recentResults.findIndex(r => r.number === animalNumber);
        
        if (lastAppearance === -1) {
            return 15; // No ha aparecido en los últimos 100, bonus alto
        }
        
        // Bonus basado en cuánto tiempo ha pasado desde la última aparición
        const timeSinceLastAppearance = lastAppearance;
        
        if (timeSinceLastAppearance > 50) {
            return 20; // Ha pasado mucho tiempo
        } else if (timeSinceLastAppearance > 30) {
            return 10; // Ha pasado tiempo moderado
        } else if (timeSinceLastAppearance > 15) {
            return 5; // Ha pasado poco tiempo
        } else {
            return -10; // Ha aparecido muy recientemente, penalización
        }
    }

    // Predicción de color SIMPLIFICADA - Más efectiva
    predictAggressiveColor(recentResults) {
        if (recentResults.length < 10) {
            return { color: 'black', probability: 50, reason: 'Datos insuficientes' };
        }

        const last10 = recentResults.slice(0, 10);
        
        // DETECTAR RACHA CONSECUTIVA REAL (no solo conteo total)
        const firstColor = this.colorMap[last10[0].number];
        let consecutiveStreak = 1;
        
        // Contar racha consecutiva desde el primer resultado
        for (let i = 1; i < last10.length; i++) {
            const currentColor = this.colorMap[last10[i].number];
            if (currentColor === firstColor) {
                consecutiveStreak++;
            } else {
                break; // Romper en el primer color diferente
            }
        }
        
        // Si hay racha consecutiva de 3+ del mismo color, predecir opuesto
        if (consecutiveStreak >= 3 && firstColor !== 'green') {
            const oppositeColor = firstColor === 'red' ? 'black' : 'red';
            return {
                color: oppositeColor,
                probability: 85,
                reason: `Racha consecutiva de ${consecutiveStreak} ${firstColor} → ${oppositeColor.toUpperCase()}`
            };
        }
        // Si hay racha consecutiva de 2 del mismo color, predecir opuesto
        else if (consecutiveStreak >= 2 && firstColor !== 'green') {
            const oppositeColor = firstColor === 'red' ? 'black' : 'red';
            return {
                color: oppositeColor,
                probability: 70,
                reason: `Racha consecutiva de ${consecutiveStreak} ${firstColor} → ${oppositeColor.toUpperCase()}`
            };
        }
        // Sin racha consecutiva → Alternar basado en último color
        else {
            const lastColor = this.colorMap[last10[0].number];
            const predictedColor = lastColor === 'red' ? 'black' : 'red';
            return {
                color: predictedColor,
                probability: 60,
                reason: `Alternancia: último ${lastColor} → ${predictedColor.toUpperCase()}`
            };
        }
    }

    // NUEVAS FUNCIONES PARA MEJORAS DE COLORES
    
    // Analizar rachas de colores consecutivos
    analyzeColorStreaks(recentResults) {
        if (recentResults.length < 5) {
            return { shouldBreakStreak: false, streakLength: 0, currentColor: null, oppositeColor: null };
        }
        
        const recent = recentResults.slice(0, 10); // Últimos 10 resultados
        const firstColor = this.colorMap[recent[0].number];
        let streakLength = 1;
        
        // Contar racha actual
        for (let i = 1; i < recent.length; i++) {
            const currentColor = this.colorMap[recent[i].number];
            if (currentColor === firstColor) {
                streakLength++;
            } else {
                break;
            }
        }
        
        // Si hay racha de 5+ del mismo color → Recomendar romperla
        if (streakLength >= 5) {
            let oppositeColor;
            if (firstColor === 'red') {
                oppositeColor = 'black';
            } else if (firstColor === 'black') {
                oppositeColor = 'red';
            } else {
                // Verde → Alternar entre rojo/negro
                oppositeColor = Math.random() < 0.5 ? 'red' : 'black';
            }
            
            return {
                shouldBreakStreak: true,
                streakLength: streakLength,
                currentColor: firstColor,
                oppositeColor: oppositeColor
            };
        }
        
        return { shouldBreakStreak: false, streakLength: streakLength, currentColor: firstColor, oppositeColor: null };
    }
    
    // Calcular bonus horario para colores
    calculateHourlyColorBonus() {
        const now = new Date();
        const hour = now.getHours();
        
        // Basado en análisis: 1am y 12am tienen más verde
        let greenBonus = 0;
        
        if (hour === 1 || hour === 0) { // 1am o 12am
            greenBonus = 20; // +20% para verde
        } else if (hour === 2 || hour === 3) { // 2am-3am
            greenBonus = -15; // -15% para verde (menos probable)
        } else if (hour >= 4 && hour <= 6) { // 4am-6am
            greenBonus = -5; // Leve penalización
        }
        
        return {
            green: greenBonus,
            hour: hour
        };
    }
    
    // Analizar patrones de alternancia
    analyzeAlternationPattern(recentResults) {
        if (recentResults.length < 10) {
            return { predictedColor: 'black', confidence: 0, reason: 'Datos insuficientes' };
        }
        
        const last10 = recentResults.slice(0, 10);
        let alternations = 0;
        
        // Contar alternaciones en los últimos 10
        for (let i = 1; i < last10.length; i++) {
            const prevColor = this.colorMap[last10[i-1].number];
            const currColor = this.colorMap[last10[i].number];
            if (prevColor !== currColor && prevColor !== 'green' && currColor !== 'green') {
                alternations++;
            }
        }
        
        const alternationRate = alternations / 9; // 9 posibles alternaciones
        const lastColor = this.colorMap[last10[0].number];
        
        if (alternationRate > 0.6) {
            // Alta alternancia → Predecir opuesto
            const oppositeColor = lastColor === 'red' ? 'black' : 'red';
            return {
                predictedColor: oppositeColor,
                confidence: Math.round(alternationRate * 15),
                reason: `Alta alternancia (${(alternationRate*100).toFixed(0)}%) → ${oppositeColor.toUpperCase()}`
            };
        } else {
            // Baja alternancia → Predecir mismo
            return {
                predictedColor: lastColor === 'green' ? 'black' : lastColor,
                confidence: Math.round((1-alternationRate) * 10),
                reason: `Baja alternancia (${(alternationRate*100).toFixed(0)}%) → Continuar ${lastColor.toUpperCase()}`
            };
        }
    }

    // Actualizar sistema de temperatura
    updateTemperatureSystem(animalStats) {
        this.temperatureSystem.hotAnimals = [];
        this.temperatureSystem.warmAnimals = [];
        this.temperatureSystem.coldAnimals = [];

        // Umbrales ajustados para datasets pequeños - DECLARAR FUERA DEL BUCLE
        const totalResults = this.allResults.length;
        let hotThreshold, warmThreshold;
        
        if (totalResults < 50) {
            // Con pocos datos, ser más flexible
            hotThreshold = Math.max(2, (2 / totalResults) * 100); // Al menos 2 apariciones
            warmThreshold = Math.max(1, (1 / totalResults) * 100); // Al menos 1 aparición
        } else {
            // Con más datos, usar umbrales normales
            hotThreshold = 4;
            warmThreshold = 1.5;
        }

        for (let animalNumber = 0; animalNumber <= 37; animalNumber++) {
            const stats = animalStats[animalNumber];
            const animalData = {
                number: animalNumber,
                name: this.animals[animalNumber],
                frequency: stats.frequency,
                percentage: stats.percentage,
                lastSeen: stats.lastSeen,
                color: this.colorMap[animalNumber]
            };

            if (stats.percentage > hotThreshold) {
                this.temperatureSystem.hotAnimals.push(animalData);
            } else if (stats.percentage > warmThreshold) {
                this.temperatureSystem.warmAnimals.push(animalData);
            } else {
                this.temperatureSystem.coldAnimals.push(animalData);
            }
        }
        
        // DEBUG: Mostrar información del sistema de temperatura
        console.log('🌡️ Sistema de Temperatura Actualizado:');
        console.log(`   🔥 Animales Calientes (>${hotThreshold}%): ${this.temperatureSystem.hotAnimals.length}`);
        console.log(`   🌤️ Animales Tibios (${warmThreshold}-${hotThreshold}%): ${this.temperatureSystem.warmAnimals.length}`);
        console.log(`   ❄️ Animales Fríos (<${warmThreshold}%): ${this.temperatureSystem.coldAnimals.length}`);
        
        if (this.temperatureSystem.hotAnimals.length > 0) {
            console.log('   🔥 Animales Calientes:', this.temperatureSystem.hotAnimals.map(a => `${a.number}(${a.name}) ${a.percentage.toFixed(1)}%`).join(', '));
        }
    }

    // Actualizar con nuevo resultado
    updateWithNewResult(newResult) {
        console.log('🔄 Actualizando con nuevo resultado:', newResult);
        
        this.allResults.unshift(newResult);
        this.updateAccuracy(newResult);
        
        return this.generatePredictions();
    }

    // Actualizar precisión
    updateAccuracy(newResult) {
        if (this.lastPrediction) {
            this.accuracyHistory.total++;
            
            const wasAnimalCorrect = this.lastPrediction.predictions.some(p => p.number === newResult.number);
            const wasColorCorrect = this.lastPrediction.colorPrediction.color === this.colorMap[newResult.number];
            
            if (wasAnimalCorrect) {
                this.accuracyHistory.hits++;
            }
            
            this.accuracyHistory.accuracy = (this.accuracyHistory.hits / this.accuracyHistory.total) * 100;
            
            console.log(`📊 Precisión: ${this.accuracyHistory.accuracy.toFixed(1)}% (${this.accuracyHistory.hits}/${this.accuracyHistory.total})`);
            console.log(`🎯 Animal correcto: ${wasAnimalCorrect ? '✅' : '❌'}`);
            console.log(`🎨 Color correcto: ${wasColorCorrect ? '✅' : '❌'}`);
        }
    }

    // Método predict para compatibilidad
    predict() {
        const predictions = this.generatePredictions();
        this.lastPrediction = predictions;
        return predictions;
    }
}

module.exports = DynamicPredictionAlgorithm;
