const { animalMapping } = require('./animal-mapping');

class DeductionEngine {
    constructor() {
        this.animalMapping = animalMapping;
        this.deductionHistory = [];
    }

    /**
     * Motor principal de deducción - enfoque suave y equilibrado
     */
    analyzeDeduction(data) {
        console.log('🧠 Iniciando análisis deductivo suave...');
        
        if (!data || !data.results || data.results.length < 10) {
            return this.getEmptyDeduction();
        }

        const lastResults = data.results.slice(0, 20); // Últimos 20 resultados
        const deduction = {
            timestamp: new Date(),
            analysis: {},
            recommendations: [],
            confidence: 0,
            reasoning: []
        };

        // 1. Análisis de patrones sutiles (no agresivos)
        deduction.analysis.patterns = this.analyzeSoftPatterns(lastResults);
        
        // 2. Análisis de equilibrio natural
        deduction.analysis.balance = this.analyzeNaturalBalance(lastResults);
        
        // 3. Análisis de tendencias suaves
        deduction.analysis.trends = this.analyzeSoftTrends(lastResults);
        
        // 4. Generar recomendaciones equilibradas
        deduction.recommendations = this.generateBalancedRecommendations(deduction.analysis);
        
        // 5. Calcular confianza moderada
        deduction.confidence = this.calculateModerateConfidence(deduction.analysis);
        
        // 6. Generar razonamiento claro
        deduction.reasoning = this.generateReasoning(deduction.analysis);

        console.log(`🧠 Deducción completada con ${deduction.confidence}% de confianza`);
        
        return deduction;
    }

    /**
     * Análisis de patrones sutiles - sin ser agresivo
     */
    analyzeSoftPatterns(results) {
        const patterns = {
            colorBalance: this.analyzeColorBalance(results),
            temperatureFlow: this.analyzeTemperatureFlow(results),
            sequenceHints: this.analyzeSequenceHints(results),
            naturalCycles: this.analyzeNaturalCycles(results)
        };

        return patterns;
    }

    /**
     * Análisis de balance de colores - suave
     */
    analyzeColorBalance(results) {
        const colorCounts = { red: 0, black: 0, green: 0 };
        const last10 = results.slice(0, 10);
        
        last10.forEach(result => {
            const animal = this.animalMapping[result.number];
            if (animal) {
                colorCounts[animal.color]++;
            }
        });

        const total = last10.length;
        const balance = {
            red: (colorCounts.red / total) * 100,
            black: (colorCounts.black / total) * 100,
            green: (colorCounts.green / total) * 100,
            trend: 'equilibrado'
        };

        // Determinar tendencia suave (no agresiva)
        if (balance.red > 60) balance.trend = 'rojo_dominante_suave';
        else if (balance.black > 60) balance.trend = 'negro_dominante_suave';
        else if (balance.red < 30) balance.trend = 'rojo_necesita_balance';
        else if (balance.black < 30) balance.trend = 'negro_necesita_balance';

        return balance;
    }

    /**
     * 🆕 MEJORAR DEDUCCIÓN DE COLOR - Análisis más inteligente
     */
    analyzeColorPrediction(results) {
        const last15 = results.slice(0, 15);
        const colorSequence = last15.map(r => {
            const animal = this.animalMapping[r.number];
            return animal ? animal.color : null;
        }).filter(color => color !== null);

        // Análisis de secuencia de colores
        const redCount = colorSequence.filter(c => c === 'red').length;
        const blackCount = colorSequence.filter(c => c === 'black').length;
        const greenCount = colorSequence.filter(c => c === 'green').length;

        // Calcular probabilidad dinámica basada en patrones
        let redProbability = 50; // Base neutral
        let blackProbability = 50; // Base neutral

        // Factor 1: Balance reciente (últimos 5)
        const recentRed = colorSequence.slice(0, 5).filter(c => c === 'red').length;
        const recentBlack = colorSequence.slice(0, 5).filter(c => c === 'black').length;
        
        if (recentRed > recentBlack) {
            blackProbability += 15; // Si rojo dominó recientemente, negro tiene más probabilidad
            redProbability -= 10;
        } else if (recentBlack > recentRed) {
            redProbability += 15; // Si negro dominó recientemente, rojo tiene más probabilidad
            blackProbability -= 10;
        }

        // Factor 2: Secuencia de alternancia
        const last3Colors = colorSequence.slice(0, 3);
        if (last3Colors.length >= 3) {
            if (last3Colors[0] === 'red' && last3Colors[1] === 'black' && last3Colors[2] === 'red') {
                blackProbability += 20; // Patrón rojo-negro-rojo sugiere negro
                redProbability -= 15;
            } else if (last3Colors[0] === 'black' && last3Colors[1] === 'red' && last3Colors[2] === 'black') {
                redProbability += 20; // Patrón negro-rojo-negro sugiere rojo
                blackProbability -= 15;
            }
        }

        // Factor 3: Deuda de color (si un color no ha salido en mucho tiempo)
        const lastRedIndex = colorSequence.findIndex(c => c === 'red');
        const lastBlackIndex = colorSequence.findIndex(c => c === 'black');
        
        if (lastRedIndex > 8) { // Rojo no ha salido en los últimos 8
            redProbability += 25;
            blackProbability -= 20;
        } else if (lastBlackIndex > 8) { // Negro no ha salido en los últimos 8
            blackProbability += 25;
            redProbability -= 20;
        }

        // Factor 4: Variabilidad aleatoria para evitar patrones fijos
        const randomFactor = Math.random() * 20 - 10; // -10 a +10
        redProbability += randomFactor;
        blackProbability -= randomFactor;

        // Normalizar probabilidades
        redProbability = Math.max(20, Math.min(80, redProbability));
        blackProbability = Math.max(20, Math.min(80, blackProbability));

        // Determinar color predicho
        let predictedColor = 'black';
        let predictedProbability = blackProbability;
        
        if (redProbability > blackProbability) {
            predictedColor = 'red';
            predictedProbability = redProbability;
        }

        return {
            color: predictedColor,
            probability: Math.round(predictedProbability),
            redProbability: Math.round(redProbability),
            blackProbability: Math.round(blackProbability),
            analysis: {
                recentBalance: { red: recentRed, black: recentBlack },
                lastSequence: last3Colors,
                redDebt: lastRedIndex > 8 ? lastRedIndex : 0,
                blackDebt: lastBlackIndex > 8 ? lastBlackIndex : 0
            }
        };
    }

    /**
     * Análisis de flujo de temperatura - equilibrado
     */
    analyzeTemperatureFlow(results) {
        const tempCounts = { hot: 0, warm: 0, cold: 0 };
        const last8 = results.slice(0, 8);
        
        // Clasificación simple de temperatura basada en frecuencia
        const hotAnimals = [1, 3, 5, 8, 10, 12, 14, 16, 21, 27, 32, 34]; // Más frecuentes
        const coldAnimals = [0, 6, 13, 17, 20, 22, 24, 26, 28, 29, 31, 37]; // Menos frecuentes
        
        last8.forEach(result => {
            if (hotAnimals.includes(result.number)) tempCounts.hot++;
            else if (coldAnimals.includes(result.number)) tempCounts.cold++;
            else tempCounts.warm++;
        });

        return {
            hot: (tempCounts.hot / last8.length) * 100,
            warm: (tempCounts.warm / last8.length) * 100,
            cold: (tempCounts.cold / last8.length) * 100,
            suggestion: this.getTemperatureSuggestion(tempCounts, last8.length)
        };
    }

    /**
     * Sugerencia de temperatura - suave
     */
    getTemperatureSuggestion(counts, total) {
        const hotPercent = (counts.hot / total) * 100;
        const coldPercent = (counts.cold / total) * 100;
        
        if (hotPercent > 50) return 'considerar_tibios_frios';
        if (coldPercent > 50) return 'considerar_calientes_tibios';
        return 'mantener_equilibrio';
    }

    /**
     * Análisis de secuencias - hints sutiles
     */
    analyzeSequenceHints(results) {
        const hints = [];
        const last5 = results.slice(0, 5);
        
        // Buscar patrones sutiles en las últimas secuencias
        for (let i = 0; i < last5.length - 1; i++) {
            const current = last5[i].number;
            const next = last5[i + 1].number;
            
            // Patrones de alternancia suave
            const currentAnimal = this.animalMapping[current];
            const nextAnimal = this.animalMapping[next];
            
            if (currentAnimal && nextAnimal) {
                if (currentAnimal.color !== nextAnimal.color) {
                    hints.push({
                        type: 'alternancia_color',
                        description: `${currentAnimal.name} → ${nextAnimal.name}`,
                        strength: 'suave'
                    });
                }
            }
        }

        return hints;
    }

    /**
     * Análisis de ciclos naturales - no forzado
     */
    analyzeNaturalCycles(results) {
        const cycles = {
            shortCycle: this.analyzeShortCycle(results.slice(0, 6)),
            mediumCycle: this.analyzeMediumCycle(results.slice(0, 12)),
            longCycle: this.analyzeLongCycle(results.slice(0, 20))
        };

        return cycles;
    }

    analyzeShortCycle(results) {
        const animals = results.map(r => r.number);
        const uniqueAnimals = [...new Set(animals)];
        
        return {
            diversity: (uniqueAnimals.length / results.length) * 100,
            repetitions: results.length - uniqueAnimals.length,
            trend: uniqueAnimals.length > 4 ? 'diverso' : 'concentrado'
        };
    }

    analyzeMediumCycle(results) {
        const colorSequence = results.map(r => {
            const animal = this.animalMapping[r.number];
            return animal ? animal.color : 'unknown';
        });

        const colorChanges = colorSequence.reduce((changes, color, index) => {
            if (index > 0 && color !== colorSequence[index - 1]) {
                changes++;
            }
            return changes;
        }, 0);

        return {
            colorChanges,
            stability: colorChanges < 6 ? 'estable' : 'variable',
            recommendation: colorChanges < 4 ? 'esperar_cambio_suave' : 'mantener_observacion'
        };
    }

    analyzeLongCycle(results) {
        const animalFreq = {};
        results.forEach(r => {
            animalFreq[r.number] = (animalFreq[r.number] || 0) + 1;
        });

        const avgFreq = results.length / Object.keys(animalFreq).length;
        const overRepresented = Object.keys(animalFreq).filter(animal => 
            animalFreq[animal] > avgFreq * 1.5
        );

        return {
            averageFrequency: avgFreq,
            overRepresented: overRepresented.map(num => ({
                animal: parseInt(num),
                name: this.animalMapping[num]?.name || 'Unknown',
                frequency: animalFreq[num]
            })),
            balance: overRepresented.length < 3 ? 'equilibrado' : 'necesita_balance_suave'
        };
    }

    /**
     * Análisis de equilibrio natural - no forzado
     */
    analyzeNaturalBalance(results) {
        const balance = {
            overall: 'equilibrado',
            colorNeed: 'ninguno',
            temperatureNeed: 'ninguno',
            suggestion: 'seguir_patrones_normales'
        };

        const last12 = results.slice(0, 12);
        const colorCounts = { red: 0, black: 0, green: 0 };
        
        last12.forEach(result => {
            const animal = this.animalMapping[result.number];
            if (animal) {
                colorCounts[animal.color]++;
            }
        });

        // Balance suave - no agresivo
        const redPercent = (colorCounts.red / last12.length) * 100;
        const blackPercent = (colorCounts.black / last12.length) * 100;

        if (redPercent > 70) {
            balance.colorNeed = 'negro_suave';
            balance.suggestion = 'considerar_negros_moderadamente';
        } else if (blackPercent > 70) {
            balance.colorNeed = 'rojo_suave';
            balance.suggestion = 'considerar_rojos_moderadamente';
        }

        return balance;
    }

    /**
     * Análisis de tendencias suaves
     */
    analyzeSoftTrends(results) {
        const trends = {
            direction: 'neutro',
            strength: 'suave',
            recommendation: 'observar_patrones'
        };

        const last6 = results.slice(0, 6);
        const colorSequence = last6.map(r => {
            const animal = this.animalMapping[r.number];
            return animal ? animal.color : null;
        }).filter(color => color !== null);

        // Detectar tendencias suaves
        const redCount = colorSequence.filter(c => c === 'red').length;
        const blackCount = colorSequence.filter(c => c === 'black').length;

        if (redCount > blackCount * 1.5) {
            trends.direction = 'hacia_negro_suave';
            trends.recommendation = 'considerar_balance_con_negros';
        } else if (blackCount > redCount * 1.5) {
            trends.direction = 'hacia_rojo_suave';
            trends.recommendation = 'considerar_balance_con_rojos';
        }

        return trends;
    }

    /**
     * Generar recomendaciones equilibradas
     */
    generateBalancedRecommendations(analysis) {
        const recommendations = [];

        // Recomendación de color (suave)
        if (analysis.balance.colorNeed !== 'ninguno') {
            recommendations.push({
                type: 'color',
                priority: 'media',
                suggestion: analysis.balance.suggestion,
                confidence: 60
            });
        }

        // Recomendación de temperatura (equilibrada)
        if (analysis.patterns.temperatureFlow.suggestion !== 'mantener_equilibrio') {
            recommendations.push({
                type: 'temperatura',
                priority: 'baja',
                suggestion: analysis.patterns.temperatureFlow.suggestion,
                confidence: 50
            });
        }

        // Recomendación de patrones (observacional)
        if (analysis.patterns.naturalCycles.longCycle.balance === 'necesita_balance_suave') {
            recommendations.push({
                type: 'patron',
                priority: 'baja',
                suggestion: 'considerar_animales_menos_frecuentes',
                confidence: 45
            });
        }

        return recommendations;
    }

    /**
     * Calcular confianza moderada - no agresiva
     */
    calculateModerateConfidence(analysis) {
        let confidence = 40; // Base moderada

        // Incrementos suaves
        if (analysis.balance.colorNeed !== 'ninguno') confidence += 10;
        if (analysis.patterns.colorBalance.trend !== 'equilibrado') confidence += 8;
        if (analysis.trends.direction !== 'neutro') confidence += 7;
        if (analysis.patterns.sequenceHints.length > 0) confidence += 5;

        // Máximo 70% para mantener moderación
        return Math.min(confidence, 70);
    }

    /**
     * Generar razonamiento claro y no agresivo
     */
    generateReasoning(analysis) {
        const reasoning = [];

        if (analysis.balance.colorNeed !== 'ninguno') {
            reasoning.push({
                factor: 'Balance de colores',
                description: `Se observa una ligera tendencia hacia ${analysis.balance.colorNeed}`,
                weight: 'moderado'
            });
        }

        if (analysis.patterns.temperatureFlow.suggestion !== 'mantener_equilibrio') {
            reasoning.push({
                factor: 'Flujo de temperatura',
                description: `Sugerencia suave: ${analysis.patterns.temperatureFlow.suggestion}`,
                weight: 'bajo'
            });
        }

        if (analysis.trends.direction !== 'neutro') {
            reasoning.push({
                factor: 'Tendencia observada',
                description: `Dirección suave: ${analysis.trends.direction}`,
                weight: 'bajo'
            });
        }

        return reasoning;
    }

    /**
     * Deducción vacía para casos sin datos
     */
    getEmptyDeduction() {
        return {
            timestamp: new Date(),
            analysis: {},
            recommendations: [],
            confidence: 0,
            reasoning: [{
                factor: 'Datos insuficientes',
                description: 'Se requieren más resultados para análisis deductivo',
                weight: 'informativo'
            }]
        };
    }

    /**
     * Combinar deducción con predicciones existentes
     */
    combineWithPredictions(predictions, deduction) {
        if (!deduction.recommendations.length) return predictions;

        console.log('🔗 Combinando deducción suave con predicciones...');

        // Aplicar ajustes suaves basados en deducción
        const adjustedPredictions = predictions.map(pred => {
            const animal = this.animalMapping[pred.animal];
            if (!animal) return pred;

            let adjustment = 0;

            // Ajustes suaves por color
            deduction.recommendations.forEach(rec => {
                if (rec.type === 'color' && rec.confidence > 50) {
                    if (rec.suggestion.includes('negros') && animal.color === 'black') {
                        adjustment += 3; // Ajuste muy suave
                    } else if (rec.suggestion.includes('rojos') && animal.color === 'red') {
                        adjustment += 3; // Ajuste muy suave
                    }
                }
            });

            return {
                ...pred,
                totalProbability: pred.totalProbability + adjustment,
                deductionBonus: adjustment,
                deductionReason: adjustment > 0 ? 'Balance suave de color' : null
            };
        });

        return adjustedPredictions;
    }
}

module.exports = { DeductionEngine };
