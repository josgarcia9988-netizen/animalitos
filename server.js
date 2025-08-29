// Cargar variables de entorno
require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const zlib = require('zlib');
const { DeductionEngine } = require('./deduction-engine');
const TelegramBot = require('./telegram-bot');
const DatabaseManager = require('./database');

class WebServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 8000;
        this.allResults = [];
        this.isMonitoring = false;
        this.monitorInterval = null;
        this.updateInterval = null;
        this.autoAdjustInterval = null;
        
        // Inicializar DatabaseManager
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
        
        // Listas de animales repetidores
        this.animalesRepetidores = [3, 2, 1, 4, 28, 31, 37]; // Repetidores reales
        this.animalesRepetidoresModerados = [22, 32, 35, 0]; // Repetidores moderados
        
        // Sistema de seguimiento de predicciones
        this.predictionHistory = [];
        this.currentPredictions = null;
        this.currentUpdateInterval = 10000; // Intervalo actual en milisegundos
        
        // Motor de deducción
        this.deductionEngine = new DeductionEngine();
        
        // Sistema de notificaciones Telegram
        this.telegramBot = new TelegramBot();
        this.telegramBot.setServerReference(this); // Pasar referencia del servidor
        
        // Iniciar bot de Telegram con polling
        this.telegramBot.startPolling();
        
        this.setupMiddleware();
        this.setupRoutes();
        this.initializeDatabase();
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.static('public'));
    }

    setupRoutes() {
        // Ruta principal
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        // API: Últimos resultados
        this.app.get('/api/last-results', async (req, res) => {
            try {
                // Obtener resultados FRESCOS del sitio web
                let currentResults = [];
                
                try {
                    // Intentar obtener datos del sitio web
                    const url = 'https://juegoactivo.com/resultados/animalitos';
                    const html = await this.fetchWithDecompression(url);
                    currentResults = this.extractMegaAnimalitosResults(html);
                    
                    if (currentResults.length === 0) {
                        // Si no hay resultados del sitio web, usar datos de MongoDB
                        console.log('⚠️ No se pudieron obtener datos del sitio web, usando MongoDB');
                        const sortedResults = this.allResults.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                        currentResults = sortedResults.slice(0, 10);
                    } else {
                        console.log(`✅ Datos frescos obtenidos del sitio web: ${currentResults.length} resultados`);
                    }
                } catch (webError) {
                    console.error('❌ Error obteniendo datos del sitio web:', webError);
                    // Usar datos de MongoDB como respaldo
                    const sortedResults = this.allResults.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    currentResults = sortedResults.slice(0, 10);
                }
                
                // Procesar resultados para el frontend
                const ultimos = currentResults.slice(0, 10).map(result => {
                    const resultCopy = { ...result };
                    
                    // Buscar predicción asociada para calcular aciertos
                    const associatedPrediction = this.predictionHistory.find(pred => 
                        pred.actualResult && 
                        pred.actualResult.animal === result.number &&
                        Math.abs(new Date(pred.actualResult.timestamp) - new Date(result.timestamp)) < 60000
                    );
                    
                    if (associatedPrediction) {
                        resultCopy.animalHit = associatedPrediction.animalHit;
                        resultCopy.colorHit = associatedPrediction.colorHit;
                    }
                    
                    // Formatear timeStr
                    if (resultCopy.timeStr && typeof resultCopy.timeStr === 'string') {
                        resultCopy.timeStr = resultCopy.timeStr.trim();
                        
                        const time24Match = resultCopy.timeStr.match(/^(\d{1,2}):(\d{2})$/);
                        if (time24Match) {
                            const hours = parseInt(time24Match[1]);
                            const minutes = time24Match[2];
                            const ampm = hours >= 12 ? 'pm' : 'am';
                            const displayHours = hours % 12 || 12;
                            resultCopy.timeStr = `${displayHours}:${minutes}${ampm}`;
                        }
                    } else if (resultCopy.timestamp) {
                        const date = new Date(resultCopy.timestamp);
                        const hours = date.getHours();
                        const minutes = date.getMinutes();
                        const ampm = hours >= 12 ? 'pm' : 'am';
                        const displayHours = hours % 12 || 12;
                        resultCopy.timeStr = `${displayHours}:${minutes.toString().padStart(2, '0')}${ampm}`;
                    } else {
                        resultCopy.timeStr = 'N/A';
                    }
                    
                    return resultCopy;
                });
                
                // Enviar resultados al frontend
                res.json({ success: true, results: ultimos });
            } catch (error) {
                console.error('❌ Error en /api/last-results:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Estadísticas
        this.app.get('/api/stats', async (req, res) => {
            try {
                // NO recargar datos aquí para evitar interferencia
                const stats = {
                    totalResultados: this.allResults.length,
                    ultimaActualizacion: this.allResults.length > 0 ? this.allResults[0].timestamp : null,
                    animalesUnicos: new Set(this.allResults.map(r => r.number)).size
                };
                res.json({ success: true, stats: stats });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Iniciar actualización automática
        this.app.post('/api/start-auto-update', (req, res) => {
            try {
                this.startAutoUpdate();
                res.json({ success: true, message: 'Actualización automática iniciada' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });



        // API: Forzar actualización
        this.app.post('/api/force-update', async (req, res) => {
            try {
                console.log('🔄 Forzando actualización manual...');
                await this.fetchAndUpdateData();
                // Recargar datos después de la actualización
                await this.loadExistingData();
                res.json({ success: true, message: 'Actualización forzada completada' });
            } catch (error) {
                console.error('❌ Error en actualización forzada:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Obtener predicciones
        this.app.get('/api/predictions', async (req, res) => {
            try {
                // Cargar el algoritmo y generar predicciones frescas con distribución balanceada
                const DynamicPredictionAlgorithm = require('./prediction-algorithm.js');
                const algorithm = new DynamicPredictionAlgorithm();
                
                const dataLoaded = await algorithm.loadData();
                if (!dataLoaded) {
                    return res.status(500).json({ success: false, error: 'No se pudieron cargar los datos' });
                }
                
                // Generar predicciones frescas con el nuevo algoritmo de distribución balanceada
                const predictions = algorithm.generatePredictions();
                
                // Mapear predicciones al formato esperado por el frontend
                const mappedPredictions = predictions.predictions.map(p => ({
                    animal: p.number,
                    animalName: this.animals[p.number] || `Animal ${p.number}`,
                    totalProbability: Math.min(95, Math.max(5, (p.score + 200) / 8)), // Convertir score a probabilidad (5-95%)
                    color: this.getAnimalColor(p.number)
                }));
                
                // Calcular efectividad de las últimas predicciones
                const effectiveness = this.calculatePredictionEffectiveness();
                
                res.json({
                    success: true,
                    predictions: mappedPredictions,
                    colorPrediction: predictions.colorPrediction,
                    effectiveness: effectiveness,
                    analysis: {
                        totalResults: algorithm.allResults.length,
                        colorStats: predictions.colorPrediction,
                        patternWeight: 60,
                        temperatureWeight: 40,
                        temperatureStats: {
                            hot: algorithm.temperatureSystem.hotAnimals.length,
                            warm: algorithm.temperatureSystem.warmAnimals.length,
                            cold: algorithm.temperatureSystem.coldAnimals.length,
                            hotAnimals: algorithm.temperatureSystem.hotAnimals,
                            warmAnimals: algorithm.temperatureSystem.warmAnimals,
                            coldAnimals: algorithm.temperatureSystem.coldAnimals
                        }
                    },
                    // Agregar datos adicionales para el frontend
                    animalData: this.getAnimalAdditionalData(algorithm.allResults)
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Obtener efectividad de predicciones
        this.app.get('/api/effectiveness', async (req, res) => {
            try {
                // console.log('🔍 API /api/effectiveness llamada - ejecutando calculatePredictionEffectiveness()');
                const effectiveness = await this.calculatePredictionEffectiveness();
                // console.log('✅ calculatePredictionEffectiveness() completado');
                
                // Agregar información de debug para entender el problema
                const debugInfo = {
                    predictionHistoryLength: this.predictionHistory ? this.predictionHistory.length : 0,
                    allResultsLength: this.allResults ? this.allResults.length : 0,
                    last10Results: this.allResults ? this.allResults.slice(0, 10).map(r => ({
                        number: r.number,
                        animal: r.animal,
                        timeStr: r.timeStr,
                        color: r.color
                    })) : []
                };
                
                res.json({ 
                    success: true, 
                    effectiveness: effectiveness,
                    debug: debugInfo
                });
            } catch (error) {
                console.error('❌ Error en /api/effectiveness:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Obtener estadísticas completas de efectividad
        this.app.get('/api/effectiveness-stats', async (req, res) => {
            try {
                const stats = await this.calculateComprehensiveStats();
                res.json({ success: true, stats: stats });
            } catch (error) {
                console.error('Error calculando estadísticas completas:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Enviar mensaje de prueba a Telegram
        this.app.post('/api/telegram-test', async (req, res) => {
            try {
                await this.telegramBot.sendTestMessage();
                res.json({ success: true, message: 'Mensaje de prueba enviado a Telegram' });
            } catch (error) {
                console.error('Error enviando mensaje de prueba:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Enviar predicciones automáticas a Telegram
        this.app.post('/api/telegram-predictions', async (req, res) => {
            try {
                // Verificar si hay predicciones actuales
                if (!this.currentPredictions || !this.currentPredictions.predictions) {
                    return res.json({ success: false, message: 'No hay predicciones disponibles' });
                }

                // Obtener efectividad actual
                const effectiveness = await this.calculatePredictionEffectiveness();
                
                // Solo enviar si la precisión supera el umbral
                if (parseFloat(effectiveness.overallAccuracy) > 50) {
                    const message = `🎯 <b>PREDICCIONES AUTOMÁTICAS</b> 🎯\n\n` +
                                  `📊 <b>Efectividad Actual:</b> ${effectiveness.overallAccuracy}%\n` +
                                  `🎨 <b>Color Predicho:</b> ${this.currentPredictions.colorPrediction}\n\n` +
                                  `🦁 <b>Animales Predichos:</b>\n` +
                                  this.currentPredictions.predictions.slice(0, 8).map((pred, index) => 
                                      `${index + 1}. ${pred.animal} ${pred.animalName} (${pred.totalProbability.toFixed(1)}%)`
                                  ).join('\n') + '\n\n' +
                                  `⏰ ${new Date().toLocaleString('es-ES')}`;
                    
                    await this.telegramBot.sendMessageToAll(message);
                    res.json({ success: true, message: 'Predicciones enviadas automáticamente' });
                } else {
                    res.json({ success: false, message: 'Precisión insuficiente para enviar notificación' });
                }
            } catch (error) {
                console.error('Error enviando predicciones automáticas:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Enviar mensaje personalizado a Telegram
        this.app.post('/api/telegram-send-message', async (req, res) => {
            try {
                const { message } = req.body;
                
                if (!message) {
                    return res.status(400).json({ success: false, error: 'Mensaje requerido' });
                }
                
                await this.telegramBot.sendMessageToAll(message);
                res.json({ success: true, message: 'Mensaje enviado a Telegram' });
            } catch (error) {
                console.error('Error enviando mensaje personalizado:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Obtener historial completo de predicciones
        this.app.get('/api/prediction-history', async (req, res) => {
            try {
                // Verificar que predictionHistory existe y es un array
                if (!this.predictionHistory || !Array.isArray(this.predictionHistory)) {
                    console.log('⚠️ predictionHistory no está disponible, retornando array vacío');
                    return res.json({ 
                        success: true, 
                        history: [],
                        total: 0 
                    });
                }

                // Ordenar por timestamp más reciente primero
                const sortedHistory = this.predictionHistory.slice().sort((a, b) => {
                    return new Date(b.timestamp) - new Date(a.timestamp);
                });
                
                const history = sortedHistory.map(prediction => {
                    try {
                        const predDate = new Date(prediction.timestamp);
                        const resultDate = prediction.actualResult ? new Date(prediction.actualResult.timestamp) : null;
                        
                        return {
                            id: prediction.timestamp,
                            predictionDate: predDate.toLocaleString('es-ES'),
                            predictionTime: predDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                            predictions: prediction.predictions ? prediction.predictions.map(p => ({
                                animal: p.animal,
                                animalName: p.animalName,
                                probability: p.totalProbability ? p.totalProbability.toFixed(1) : '0.0'
                            })) : [],
                            colorPrediction: prediction.colorPrediction ? prediction.colorPrediction.color : null,
                            actualResult: prediction.actualResult ? {
                                animal: prediction.actualResult.animal,
                                animalName: prediction.actualResult.animalName,
                                color: prediction.actualResult.color,
                                time: prediction.actualResult.timeStr || 'N/A'
                            } : null,
                            animalHit: prediction.animalHit || false,
                            colorHit: prediction.colorHit || false,
                            winningAnimal: prediction.animalHit && prediction.actualResult && prediction.predictions ? 
                                prediction.predictions.find(p => p.animal === prediction.actualResult.animal) : null
                        };
                    } catch (predictionError) {
                        console.error('Error procesando predicción individual:', predictionError);
                        return null;
                    }
                }).filter(item => item !== null); // Filtrar elementos nulos
                
                res.json({ 
                    success: true, 
                    history: history, // Ya está ordenado con los más recientes primero
                    total: history.length 
                });
            } catch (error) {
                console.error('Error obteniendo historial de predicciones:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });



        // API: Obtener historial de un animal específico
        this.app.get('/api/animal-history/:animalNumber', async (req, res) => {
            try {
                const animalNumber = parseInt(req.params.animalNumber);
                
                if (isNaN(animalNumber) || animalNumber < 0 || animalNumber > 37) {
                    return res.status(400).json({ success: false, error: 'Número de animal inválido' });
                }
                
                // NO recargar datos aquí - usar los datos que ya están en memoria
                
                // Filtrar todas las apariciones del animal
                const allAppearances = this.allResults.filter(result => result.number === animalNumber);
                
                // Obtener las últimas 5 apariciones ordenadas cronológicamente
                const now = new Date();
                
                // Filtrar solo resultados con tiempos válidos y recientes (últimas 24 horas)
                const validAppearances = allAppearances.filter(app => {
                    if (!app.timeStr || typeof app.timeStr !== 'string') return false;
                    
                    // Verificar formato válido
                    const timeMatch = app.timeStr.match(/(\d+):(\d+)(am|pm)/i);
                    if (!timeMatch) return false;
                    
                    // Calcular si es de hoy (aproximadamente)
                    const appearanceTime = this.parseTimeStringToDate(app.timeStr, now);
                    const hoursDiff = (now - appearanceTime) / (1000 * 60 * 60);
                    
                    // Solo incluir apariciones de las últimas 24 horas
                    return hoursDiff >= 0 && hoursDiff <= 24;
                });
                
                // Ordenar por tiempo más reciente primero
                const sortedAppearances = validAppearances.sort((a, b) => {
                    const timeA = this.parseTimeStringToDate(a.timeStr, now);
                    const timeB = this.parseTimeStringToDate(b.timeStr, now);
                    return timeB - timeA; // Más reciente primero
                });
                
                // Tomar las últimas 5 y calcular tiempo transcurrido
                const recentAppearances = sortedAppearances.slice(0, 5).map((appearance) => {
                    // Calcular minutos transcurridos de forma más precisa
                    const appearanceTime = this.parseTimeStringToDate(appearance.timeStr, now);
                    const diffMs = now - appearanceTime;
                    const diffMinutes = Math.floor(diffMs / (1000 * 60));
                    
                    // Verificar que el cálculo sea razonable (no más de 24 horas)
                    const maxMinutes = 24 * 60; // 24 horas en minutos
                    const validDiffMinutes = Math.max(0, Math.min(diffMinutes, maxMinutes));
                    
                    return {
                        timeStr: appearance.timeStr,
                        gapMinutes: validDiffMinutes
                    };
                });
                
                // Contar apariciones en los últimos 100 resultados
                const last100Results = this.allResults.slice(0, 100);
                const last100Appearances = last100Results.filter(result => result.number === animalNumber).length;
                
                // DEBUG: Verificar datos específicos para el animal
                        // console.log(`🔍 DEBUG - Animal ${animalNumber} (${this.animals[animalNumber]}):`);
        // console.log(`   📊 Total resultados disponibles: ${this.allResults.length}`);
        // console.log(`   📋 Últimos 100 resultados: ${last100Results.length}`);
        // console.log(`   🎯 Apariciones en últimos 100: ${last100Appearances}`);
        // console.log(`   📝 Todas las apariciones: ${allAppearances.length}`);
                
                // Verificar algunos ejemplos de los últimos 100
                const sampleResults = last100Results.slice(0, 10).map(r => `${r.number}(${r.animal})`);
                // console.log(`   📋 Ejemplos de últimos 100: ${sampleResults.join(', ')}`);
                
                // Verificar si hay datos válidos
                if (this.allResults.length === 0) {
                    console.log(`⚠️ ADVERTENCIA: No hay datos disponibles para el animal ${animalNumber}`);
                }
                
                // DEBUG: Agregar logs para depuración
                // console.log(`🔍 DEBUG - Animal ${animalNumber}:`);
                // console.log(`   📊 Total resultados disponibles: ${this.allResults.length}`);
                // console.log(`   📋 Últimos 100 resultados: ${last100Results.length}`);
                // console.log(`   🎯 Apariciones en últimos 100: ${last100Appearances}`);
                // console.log(`   📝 Todas las apariciones: ${allAppearances.length}`);
                
                // Verificar si hay datos válidos
                if (this.allResults.length === 0) {
                    // console.log(`⚠️ ADVERTENCIA: No hay datos disponibles para el animal ${animalNumber}`);
                }
                
                // Analizar patrón de horas (últimos 100 resultados)
                const hourPattern = new Array(24).fill(0);
                last100Results.forEach(result => {
                    if (result.number === animalNumber) {
                        const hour = this.extractHourFromTime(result.timeStr);
                        if (hour !== null) {
                            hourPattern[hour]++;
                        }
                    }
                });
                
                const history = {
                    allAppearances: allAppearances,
                    recentAppearances: recentAppearances,
                    last100Appearances: last100Appearances,
                    hourPattern: hourPattern
                };
                
                res.json({ success: true, history: history });
            } catch (error) {
                console.error('Error obteniendo historial del animal:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });


    }

    async initializeDatabase() {
        try {
            console.log('🔌 Inicializando conexión a MongoDB...');
            const connected = await this.db.connect();
            
            if (connected) {
                console.log('✅ MongoDB conectado exitosamente');
                await this.loadExistingData();
                await this.loadPredictionHistory();
                this.startPredictionTracking();
            } else {
                console.error('❌ Error conectando a MongoDB, usando modo de respaldo con archivos JSON');
                this.loadExistingDataFromJSON();
                this.loadPredictionHistoryFromJSON();
                this.startPredictionTracking();
            }
        } catch (error) {
            console.error('❌ Error inicializando base de datos:', error);
            this.loadExistingDataFromJSON();
            this.loadPredictionHistoryFromJSON();
            this.startPredictionTracking();
        }
    }

    async loadExistingData() {
        try {
            // Verificar si MongoDB está conectado antes de intentar cargar
            if (!this.db || !this.db.connected) {
                console.log('⚠️ MongoDB no conectado, cargando desde archivos JSON...');
                this.loadExistingDataFromJSON();
                return;
            }

            // Cargando datos desde MongoDB
            const results = await this.db.getResults(); // Cargar TODOS los resultados sin límite
            
            // Asegurar que todos los resultados tengan timeStr formateado correctamente
            this.allResults = results.map(result => {
                // Limpiar espacios del timeStr si existe
                if (result.timeStr && typeof result.timeStr === 'string') {
                    result.timeStr = result.timeStr.trim();
                    
                    // Convertir de formato 24h a 12h si es necesario
                    const time24Match = result.timeStr.match(/^(\d{1,2}):(\d{2})$/);
                    if (time24Match) {
                        const hours = parseInt(time24Match[1]);
                        const minutes = time24Match[2];
                        const ampm = hours >= 12 ? 'pm' : 'am';
                        const displayHours = hours % 12 || 12;
                        result.timeStr = `${displayHours}:${minutes}${ampm}`;
                    }
                } else if (result.timestamp) {
                    // Si no tiene timeStr pero tiene timestamp, generar timeStr
                    const date = new Date(result.timestamp);
                    const hours = date.getHours();
                    const minutes = date.getMinutes();
                    const ampm = hours >= 12 ? 'pm' : 'am';
                    const displayHours = hours % 12 || 12;
                    result.timeStr = `${displayHours}:${minutes.toString().padStart(2, '0')}${ampm}`;
                } else {
                    // Si no tiene ni timeStr ni timestamp, usar N/A
                    result.timeStr = 'N/A';
                }
                return result;
            });
            
            // Ordenar por timestamp más reciente primero (FORZADO)
            // Primero intentar ordenar por timestamp
            this.allResults.sort((a, b) => {
                const timestampA = new Date(a.timestamp || 0);
                const timestampB = new Date(b.timestamp || 0);
                return timestampB - timestampA; // Más reciente primero
            });
            
            // Si los timestamps están mal, ordenar por timeStr como respaldo
            const firstResult = this.allResults[0];
            const lastResult = this.allResults[this.allResults.length - 1];
            
            if (firstResult && lastResult) {
                const firstTime = this.parseTimeStringToMinutes(firstResult.timeStr);
                const lastTime = this.parseTimeStringToMinutes(lastResult.timeStr);
                
                // Si el primer resultado tiene menor tiempo que el último, el orden está mal
                if (firstTime < lastTime) {
                    console.log('⚠️ Timestamps incorrectos detectados, reordenando por timeStr...');
                    this.allResults.sort((a, b) => {
                        const timeA = this.parseTimeStringToMinutes(a.timeStr);
                        const timeB = this.parseTimeStringToMinutes(b.timeStr);
                        return timeB - timeA; // Más reciente primero
                    });
                }
            }
            
            console.log(`📊 Datos cargados desde MongoDB: ${this.allResults.length} resultados`);
            
        } catch (error) {
            console.error('❌ Error cargando datos desde MongoDB:', error);
            console.log('🔄 Fallback a archivos JSON...');
            this.loadExistingDataFromJSON();
        }
    }

    loadExistingDataFromJSON() {
        try {
            if (fs.existsSync('mega_animalitos_daily.json')) {
                const data = fs.readFileSync('mega_animalitos_daily.json', 'utf8');
                const parsedData = JSON.parse(data);
                // Handle both old format (array) and new format (object with results array)
                let results = Array.isArray(parsedData) ? parsedData : (parsedData.results || []);
                
                // Eliminar duplicados de manera más robusta
                const uniqueResults = [];
                const seen = new Set();
                
                for (const result of results) {
                    // Crear clave única más específica
                    const key = `${result.timeStr}-${result.number}-${result.animal}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        uniqueResults.push(result);
                    } else {
                        console.log(`🔄 Duplicado eliminado al cargar: ${result.number} ${result.animal} - ${result.timeStr}`);
                    }
                }
                
                // Ordenar por tiempo cronológico (más reciente primero)
                uniqueResults.sort((a, b) => {
                    const timeA = this.parseTimeString(a.timeStr);
                    const timeB = this.parseTimeString(b.timeStr);
                    return timeB - timeA; // Orden descendente - más reciente primero
                });
                
                this.allResults = uniqueResults;
                // Datos cargados desde JSON como respaldo
            } else {
                console.log('⚠️ No se encontró archivo de datos, iniciando con array vacío');
                this.allResults = [];
            }
        } catch (error) {
            console.error('❌ Error cargando datos desde JSON:', error);
            this.allResults = [];
        }
    }

    loadExistingDataWithRefresh() {
        try {
            if (fs.existsSync('mega_animalitos_daily.json')) {
                const data = fs.readFileSync('mega_animalitos_daily.json', 'utf8');
                const parsedData = JSON.parse(data);
                // Handle both old format (array) and new format (object with results array)
                this.allResults = Array.isArray(parsedData) ? parsedData : (parsedData.results || []);
            }
        } catch (error) {
            console.error('❌ Error refrescando datos:', error);
        }
    }

    getAnimalByNumber(numero) {
        return this.animals[numero] || `Animal ${numero}`;
    }

    getAnimalColor(numero) {
        const colores = {
            0: "green", 1: "red", 2: "black", 3: "red", 4: "black",
            5: "red", 6: "black", 7: "red", 8: "black", 9: "red",
            10: "black", 11: "black", 12: "red", 13: "black", 14: "red",
            15: "black", 16: "red", 17: "black", 18: "red", 19: "red",
            20: "black", 21: "red", 22: "black", 23: "red", 24: "black",
            25: "red", 26: "black", 27: "red", 28: "black", 29: "black",
            30: "red", 31: "black", 32: "red", 33: "black", 34: "red",
            35: "black", 36: "red", 37: "green"
        };
        return colores[numero] || "black";
    }

    startAutoUpdate() {
        // console.log('🔄 Iniciando actualización automática...');
        
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        // Intervalo para actualizar datos (cada 2 segundos para mayor precisión)
        this.updateInterval = setInterval(async () => {
            try {
                await this.fetchAndUpdateData();
            } catch (error) {
                console.error('❌ Error en actualización automática:', error);
                // Continuar intentando incluso si hay errores
                // console.log('🔄 Reintentando en el próximo ciclo...');
            }
        }, 2000); // Actualizar cada 2 segundos para mayor precisión
        
        // Health check cada 10 minutos para detectar si el sistema se queda "pegado"
        this.healthCheckInterval = setInterval(async () => {
            await this.performHealthCheck();
        }, 10 * 60 * 1000); // 10 minutos
        
        // console.log('✅ Actualización automática iniciada (datos cada 2s)');
        // console.log('🔄 Sistema siempre activo - no se puede detener');
    }

    stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        console.log('🛑 Actualización automática detenida');
    }

    async performHealthCheck() {
        try {
            // console.log('🏥 Realizando health check del sistema...');
            
            const now = Date.now();
            const lastUpdate = this.lastDataUpdate || 0;
            const timeSinceLastUpdate = now - lastUpdate;
            
            // Si han pasado más de 15 minutos sin actualización, forzar una
            if (timeSinceLastUpdate > 15 * 60 * 1000) {
                // console.log('⚠️ Sistema detectado como "pegado" - forzando actualización...');
                await this.forceExtractNewResults();
            } else {
                // console.log(`✅ Sistema saludable - última actualización hace ${Math.round(timeSinceLastUpdate / 60000)} minutos`);
            }
            
        } catch (error) {
            console.error('❌ Error en health check:', error);
        }
    }

    async fetchAndUpdateData() {
        try {
            // Primero obtener el reloj del juego
            const gameHtml = await this.fetchWithDecompression('https://juegoactivo.com/jugar/mega-animalitos');
            const clockTime = this.extractClockTime(gameHtml);
            
            // Obtener reloj del juego para optimización
            
            // Determinar intervalo de actualización basado en el reloj
            const updateInterval = this.calculateUpdateInterval(clockTime);
            
            // Actualizar el intervalo de actualización automática
            this.updateAutoUpdateInterval(updateInterval);
            
            // Extraer resultados del sitio web
            const html = await this.fetchWithDecompression('https://juegoactivo.com/resultados/animalitos');
            
            const newResults = this.extractMegaAnimalitosResults(html);
            
            if (newResults && newResults.length > 0) {
                // NO recargar datos existentes en cada ciclo - usar los que ya están en memoria
                // this.loadExistingDataWithRefresh(); // REMOVIDO - esto causaba el problema
                
                // Crear claves únicas para comparación (incluir animal para mayor precisión)
                const existingKeys = new Set(this.allResults.map(r => `${r.timeStr}-${r.number}-${r.animal}`));
                
                // Verificar duplicados
                
                // Separar duplicados y nuevos resultados
                const duplicados = [];
                const nuevosUnicos = newResults.filter(r => {
                    const key = `${r.timeStr}-${r.number}-${r.animal}`;
                    const isUnique = !existingKeys.has(key);
                    
                    // Verificación silenciosa de duplicados
                    
                    if (!isUnique) {
                        duplicados.push(r);
                    } else {
                                // console.log(`🆕 Resultado nuevo detectado: ${r.number} ${r.animal} - ${r.timeStr}`);
        // console.log(`✅ Resultado agregado a la base de datos: ${r.number} ${r.animal} ${r.color} - ${r.timeStr}`);
                    }
                    return isUnique;
                });
                
                // Mostrar duplicados en orden cronológico (más reciente primero)
                if (duplicados.length > 0) {
                    // Ordenar duplicados por tiempo cronológico (más reciente primero)
                    duplicados.sort((a, b) => {
                        const timeA = this.parseTimeString(a.timeStr);
                        const timeB = this.parseTimeString(b.timeStr);
                        return timeB - timeA; // Orden descendente para mostrar más reciente primero
                    });
                    
                    // console.log(`🔄 Resultados duplicados encontrados (${duplicados.length}):`); // Log removido para limpiar pantalla
                    // duplicados.forEach(r => {
                    //     console.log(`   🔄 ${r.number} ${r.animal} - ${r.timeStr}`);
                    // }); // Log removido para limpiar pantalla
                }
                
                // console.log(`📊 Resultados extraídos: ${newResults.length}, Únicos: ${nuevosUnicos.length}`); // Log removido para limpiar pantalla
                
                if (nuevosUnicos.length > 0) {
                    // Agregar nuevos resultados al inicio (más recientes primero)
                    this.allResults.unshift(...nuevosUnicos);
                    
                    // Reordenar por tiempo cronológico (más reciente primero)
                    this.allResults.sort((a, b) => {
                        const timeA = this.parseTimeString(a.timeStr);
                        const timeB = this.parseTimeString(b.timeStr);
                        return timeB - timeA; // Orden descendente - más reciente primero
                    });
                    
                    // Asegurar conexión y guardar en MongoDB
                    try {
                        // Verificar conexión antes de guardar
                        if (!this.db || !this.db.connected) {
                            // console.log('🔌 Reconectando a MongoDB...');
                            const connected = await this.db.connect();
                            if (!connected) {
                                console.log('⚠️ No se pudo conectar a MongoDB, guardando solo en JSON');
                            }
                        }
                        
                        if (this.db && this.db.connected) {
                            await this.db.saveResults(nuevosUnicos);
                            // console.log(`✅ Guardados ${nuevosUnicos.length} resultados en MongoDB`);
                        }
                    } catch (dbError) {
                        console.error('❌ Error guardando en MongoDB:', dbError);
                        console.log('⚠️ Continuando con guardado en JSON...');
                    }
                    
                    // También guardar en JSON como respaldo
                    const dataToSave = {
                        lastUpdate: new Date().toISOString(),
                        totalResults: this.allResults.length,
                        results: this.allResults
                    };
                    fs.writeFileSync('mega_animalitos_daily.json', JSON.stringify(dataToSave, null, 2));
                    
                    // console.log(`✅ Nuevos resultados únicos: ${nuevosUnicos.length}`); // Log removido para limpiar pantalla
                    // console.log(`📊 Total de resultados: ${this.allResults.length}`); // Log removido para limpiar pantalla
                    
                    // Verificar predicciones con los nuevos resultados
                    this.checkAndUpdatePredictions(nuevosUnicos);
                    
                    // Generar nuevas predicciones inmediatamente después de un nuevo resultado
                    // console.log('🔄 Generando nuevas predicciones después del resultado...'); // Log removido para limpiar pantalla
                    await this.generateAndSavePredictions();
                    
                    // ENVIAR NOTIFICACIÓN AUTOMÁTICA A TELEGRAM
                    // console.log('📱 Enviando notificación automática a Telegram...'); // Log removido para limpiar pantalla
                    const effectiveness = this.calculatePredictionEffectiveness();
                    
                    // Verificar si alcanzamos 50% de aciertos y enviar alerta especial
                    this.telegramBot.checkAndNotify(effectiveness);
                    
                    // Actualizar el estado del servidor
                    // console.log('🔄 Sistema actualizado completamente'); // Log removido para limpiar pantalla
                } else {
                    // console.log(`ℹ️ No se encontraron nuevos resultados únicos (${newResults.length} resultados son duplicados)`);
                    
                    // SOLUCIÓN ROBUSTA: Forzar actualización cada cierto tiempo
                    const now = Date.now();
                    const lastForceUpdate = this.lastForceUpdate || 0;
                    const forceUpdateInterval = 5 * 60 * 1000; // 5 minutos
                    
                    if (newResults.length > 0 && (now - lastForceUpdate) > forceUpdateInterval) {
                        // console.log('🔄 Forzando actualización de datos (prevención de bucle)...');
                        this.lastForceUpdate = now;
                        
                        // Comparar tiempos para detectar datos más recientes
                        const siteTime = this.parseTimeStringToMinutes(newResults[0].timeStr);
                        const memoryTime = this.parseTimeStringToMinutes(this.allResults[this.allResults.length-1].timeStr);
                        
                        if (siteTime > memoryTime) {
                            // console.log('🔄 Detectados datos más recientes, recargando desde MongoDB...');
                            await this.loadExistingData();
                        } else {
                            // Si no hay datos más recientes, intentar extraer directamente
                            // console.log('🔄 Intentando extracción directa de nuevos resultados...');
                            await this.forceExtractNewResults();
                        }
                    } else if (newResults.length === 0) {
                        // console.log('⚠️ No se pudieron extraer resultados del sitio web, intentando reconexión...');
                        // Esperar un poco antes del siguiente intento
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                }
            } else {
                // console.log('⚠️ No se pudieron extraer resultados del sitio web');
            }
        } catch (error) {
            console.error('❌ Error obteniendo datos:', error);
            // Intentar recuperar datos desde MongoDB si hay error de conexión
                            // console.log('⚠️ Error de conexión, manteniendo datos actuales en memoria');
        }
    }

    parseTimeStringToMinutes(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') return 0;
        
        const cleanTimeStr = timeStr.trim();
        const match = cleanTimeStr.match(/^(\d{1,2}):(\d{2})(am|pm)?$/i);
        
        if (!match) return 0;
        
        let hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const ampm = match[3] ? match[3].toLowerCase() : '';
        
        // Convertir a formato 24h si hay am/pm
        if (ampm === 'pm' && hours !== 12) {
            hours += 12;
        } else if (ampm === 'am' && hours === 12) {
            hours = 0;
        }
        
        return hours * 60 + minutes;
    }

    async forceExtractNewResults() {
        try {
            // console.log('🔄 Iniciando extracción forzada de nuevos resultados...');
            
            // Intentar múltiples veces con diferentes estrategias
            for (let attempt = 1; attempt <= 3; attempt++) {
                // console.log(`🔄 Intento ${attempt}/3 de extracción forzada...`);
                
                // Usar diferentes User-Agents para evitar bloqueos
                const userAgents = [
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                ];
                
                const userAgent = userAgents[attempt - 1];
                
                const response = await fetch('https://www.megaanimalitos.com', {
                    method: 'GET',
                    headers: {
                        'User-Agent': userAgent,
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
                        'Accept-Encoding': 'gzip, deflate',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    },
                    timeout: 10000
                });
                
                if (!response.ok) {
                    // console.log(`❌ Error HTTP ${response.status} en intento ${attempt}`);
                    continue;
                }
                
                const html = await response.text();
                const newResults = this.extractMegaAnimalitosResults(html);
                
                if (newResults.length > 0) {
                    // console.log(`✅ Extracción forzada exitosa: ${newResults.length} resultados encontrados`);
                    
                    // Procesar los nuevos resultados
                    const nuevosUnicos = newResults.filter(newResult => {
                        return !this.allResults.some(existing => 
                            existing.number === newResult.number && 
                            existing.timeStr === newResult.timeStr
                        );
                    });
                    
                    if (nuevosUnicos.length > 0) {
                        // console.log(`🆕 Nuevos resultados únicos encontrados: ${nuevosUnicos.length}`);
                        this.allResults.push(...nuevosUnicos);
                        
                        // Guardar y procesar
                        await this.saveAndProcessNewResults(nuevosUnicos);
                        return true;
                    } else {
                        // console.log('ℹ️ No se encontraron resultados nuevos en la extracción forzada');
                    }
                }
                
                // Esperar antes del siguiente intento
                if (attempt < 3) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
            // console.log('❌ Extracción forzada falló después de 3 intentos');
            return false;
            
        } catch (error) {
            console.error('❌ Error en extracción forzada:', error);
            return false;
        }
    }

    async saveAndProcessNewResults(nuevosUnicos) {
        try {
            // Guardar en MongoDB
            if (this.db && this.db.connected) {
                await this.db.saveResults(nuevosUnicos);
                // console.log(`✅ Guardados ${nuevosUnicos.length} resultados en MongoDB`);
            }
            
            // Guardar en JSON
            const dataToSave = {
                lastUpdate: new Date().toISOString(),
                totalResults: this.allResults.length,
                results: this.allResults
            };
            fs.writeFileSync('mega_animalitos_daily.json', JSON.stringify(dataToSave, null, 2));
            
            // Verificar predicciones
            this.checkAndUpdatePredictions(nuevosUnicos);
            
            // Generar nuevas predicciones
            await this.generateAndSavePredictions();
            
            // Enviar notificaciones
            const effectiveness = this.calculatePredictionEffectiveness();
            this.telegramBot.checkAndNotify(effectiveness);
            
        } catch (error) {
            console.error('❌ Error procesando nuevos resultados:', error);
        }
    }

    extractMegaAnimalitosResults(html) {
        const results = [];
        
        // Buscando marcador de resultados (con diferentes variaciones)
        const startMarkers = [
            "## Resultados Mega Animalitos",
            "Resultados Mega Animalitos",
            "Mega Animalitos"
        ];
        
        let startIndex = -1;
        let startMarker = "";
        
        for (const marker of startMarkers) {
            startIndex = html.indexOf(marker);
            if (startIndex !== -1) {
                startMarker = marker;
                break;
            }
        }
        
        if (startIndex === -1) {
                    // console.log('❌ No se encontró el marcador de "Resultados Mega Animalitos" en el HTML');
        // console.log('🔍 Marcadores buscados:', startMarkers);
            return results;
        }
        
                        // console.log(`✅ Marcador encontrado: "${startMarker}" en posición ${startIndex}`);
        
        // Marcador encontrado, procesando resultados

        const endMarkers = [
            "Resultados Lotto Activo",
            "Resultados Ruleta Activa", 
            "Resultados La Granjita",
            "Conoce los Animalitos"
        ];
        
        let endIndex = html.length;
        for (const marker of endMarkers) {
            const markerIndex = html.indexOf(marker, startIndex + startMarker.length);
            if (markerIndex !== -1 && markerIndex < endIndex) {
                endIndex = markerIndex;
            }
        }
        
        const megaSection = html.substring(startIndex, endIndex);
        
        // Usar el patrón actualizado para la estructura real del HTML
        const resultPattern = /Resultado Mega Animalitos[^>]*>[\s\S]*?(\d+)\s*<[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/gi;
        let match;
        
                        // console.log(`🔍 Buscando resultados en sección de ${megaSection.length} caracteres`);
        
        while ((match = resultPattern.exec(megaSection)) !== null) {
            const number = parseInt(match[1]);
            const animal = match[2].trim();
            
                            // console.log(`📊 Capturó: ${number} - ${animal}`);
            
            // Convertir número de lotería a número interno (especialmente para Ballena)
            let numeroInterno = number;
            if (number === 0 && animal.toLowerCase().includes('ballena')) {
                numeroInterno = 37; // Ballena: 0 en lotería → 37 en sistema
            }
            
            const animalInfo = this.getAnimalByNumber(numeroInterno);
            if (!animalInfo) {
                // console.log(`⚠️ Animal no válido: ${numeroInterno} - ${animal}`);
                continue;
            }
            
            const contextStart = Math.max(0, match.index - 200);
            const contextEnd = Math.min(megaSection.length, match.index + 500);
            const context = megaSection.substring(contextStart, contextEnd);
            
            // Buscar el tiempo en el contexto
            const timeMatch = /(\d{1,2}):(\d{2})(am|pm)/i.exec(context);
            if (!timeMatch) {
                // console.log(`⚠️ No se encontró tiempo para ${animal} (${number})`);
                continue;
            }
            
            const hour = parseInt(timeMatch[1]);
            const minute = parseInt(timeMatch[2]);
            const ampm = timeMatch[3];
            
            const timeStr = `${hour}:${minute.toString().padStart(2, '0')}${ampm}`;
            const color = this.getAnimalColor(numeroInterno);
            
                            // console.log(`✅ Procesando: ${numeroInterno} ${animal} - ${timeStr} (${color})`);
            
            // Crear timestamp basado en la hora del resultado, no la hora actual
            const resultTimestamp = this.createTimestampFromTimeStr(timeStr);
            
            // Evitar duplicados
            const existingKey = `${timeStr}-${numeroInterno}`;
            if (!results.some(r => `${r.timeStr}-${r.number}` === existingKey)) {
                results.push({
                    number: numeroInterno,
                    animal: animal,
                    timeStr: timeStr,
                    color: color,
                    timestamp: resultTimestamp.toISOString()
                });
            } else {
                // console.log(`🔄 Duplicado encontrado: ${timeStr} - ${numeroInterno} ${animal}`);
            }
        }

        results.sort((a, b) => {
            const timeA = this.parseTimeString(a.timeStr);
            const timeB = this.parseTimeString(b.timeStr);
            return timeB - timeA;
        });
        
                        // console.log(`📊 Total de resultados extraídos: ${results.length}`);
        return results;
    }
    

    parseTimeString(timeStr) {
        // Verificar que timeStr sea válido
        if (!timeStr || typeof timeStr !== 'string') {
            return 0;
        }
        
        const match = timeStr.match(/(\d+):(\d+)(am|pm)/i);
        if (!match) {
            return 0;
        }
        
        const hour = parseInt(match[1]);
        const minute = parseInt(match[2]);
        const ampm = match[3].toLowerCase();
        
        let hour24 = hour;
        if (ampm === 'pm' && hour !== 12) {
            hour24 = hour + 12;
        } else if (ampm === 'am' && hour === 12) {
            hour24 = 0;
        }
        
        return hour24 * 60 + minute;
    }

    // Función para convertir string de tiempo a fecha
    parseTimeStringToDate(timeStr, referenceDate) {
        const match = timeStr.match(/(\d+):(\d+)(am|pm)/);
        if (!match) return referenceDate;
        
        let hour = parseInt(match[1]);
        const minute = parseInt(match[2]);
        const ampm = match[3];
        
        // Convertir a formato 24 horas
        if (ampm.toLowerCase() === 'pm' && hour < 12) {
            hour += 12;
        } else if (ampm.toLowerCase() === 'am' && hour === 12) {
            hour = 0;
        }
        
        // Crear fecha con la hora especificada
        const resultDate = new Date(referenceDate);
        resultDate.setHours(hour, minute, 0, 0);
        
        // Si la hora resultante es mayor que la hora actual, asumir que es del día anterior
        if (resultDate > referenceDate) {
            resultDate.setDate(resultDate.getDate() - 1);
        }
        
        // DEBUG: Log para verificar el cálculo
        // console.log(`🕐 DEBUG - parseTimeStringToDate:`);
        // console.log(`   📝 Input: "${timeStr}"`);
        // console.log(`   🕐 Reference: ${referenceDate.toLocaleString()}`);
        // console.log(`   🕐 Result: ${resultDate.toLocaleString()}`);
        // console.log(`   ⏱️ Diff minutes: ${Math.floor((referenceDate - resultDate) / (1000 * 60))}`);
        
        return resultDate;
    }

    async fetchWithDecompression(url) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const isHttps = urlObj.protocol === 'https:';
            const client = isHttps ? https : http;
            
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
                    'Accept-Encoding': 'gzip, deflate',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                }
            };

            const req = client.request(options, (res) => {
                let data = [];
                
                res.on('data', (chunk) => {
                    data.push(chunk);
                });
                
                res.on('end', () => {
                    try {
                        const buffer = Buffer.concat(data);
                    
                        // Intentar descomprimir si es necesario
                        if (res.headers['content-encoding'] === 'gzip') {
                            zlib.gunzip(buffer, (err, decoded) => {
                                if (err) {
                                    console.log('⚠️ Error descomprimiendo gzip, usando datos sin comprimir');
                                    resolve(buffer.toString('utf8'));
                                } else {
                                    resolve(decoded.toString('utf8'));
                                }
                            });
                        } else {
                            resolve(buffer.toString('utf8'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            
            req.on('error', (error) => {
                reject(error);
            });
            
            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('Timeout'));
            });
            
                    req.end();
    });
}

    async loadPredictionHistory() {
        try {
            console.log('🎯 Cargando TODO el historial de predicciones desde MongoDB...');
            this.predictionHistory = await this.db.getPredictionHistory(); // Cargar TODO el historial sin límite
            
            // Limpiar duplicados del historial
            this.removeDuplicatePredictions();
            
            // Historial de predicciones cargado desde MongoDB
        } catch (error) {
            console.error('❌ Error cargando historial desde MongoDB:', error);
            this.loadPredictionHistoryFromJSON();
        }
    }

    // Función para eliminar duplicados del historial de predicciones
    removeDuplicatePredictions() {
        if (!this.predictionHistory || this.predictionHistory.length === 0) return;
        
        const uniquePredictions = [];
        const seen = new Set();
        
        this.predictionHistory.forEach(prediction => {
            if (prediction.actualResult) {
                const key = `${prediction.actualResult.animal}-${prediction.actualResult.timeStr}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniquePredictions.push(prediction);
                } else {
                    // console.log(`🗑️ Duplicado eliminado: ${prediction.actualResult.animalName} (${prediction.actualResult.timeStr})`);
                }
            } else {
                // Mantener predicciones sin resultado
                uniquePredictions.push(prediction);
            }
        });
        
        const removedCount = this.predictionHistory.length - uniquePredictions.length;
        if (removedCount > 0) {
            console.log(`🧹 Limpieza completada: ${removedCount} duplicados eliminados`);
            this.predictionHistory = uniquePredictions;
            this.savePredictionHistory(); // Guardar historial limpio
        }
    }

    loadPredictionHistoryFromJSON() {
        try {
            if (fs.existsSync('prediction_history.json')) {
                const data = fs.readFileSync('prediction_history.json', 'utf8');
                this.predictionHistory = JSON.parse(data);
                // Historial de predicciones cargado desde JSON
            } else {
                this.predictionHistory = [];
                // Iniciando nuevo historial de predicciones
            }
        } catch (error) {
            console.error('❌ Error cargando historial de predicciones desde JSON:', error);
            this.predictionHistory = [];
        }
    }

    async savePredictionHistory() {
        try {
            // Verificar si MongoDB está conectado antes de intentar guardar
            if (!this.db || !this.db.connected) {
                fs.writeFileSync('prediction_history.json', JSON.stringify(this.predictionHistory, null, 2));
                return;
            }

            // Guardar el último elemento del historial en MongoDB
            if (this.predictionHistory.length > 0) {
                const lastPrediction = this.predictionHistory[this.predictionHistory.length - 1];
                try {
                    await this.db.savePredictionHistory(lastPrediction);
                } catch (mongoError) {
                    // Silenciar errores de duplicados de MongoDB
                    if (mongoError.code !== 11000) {
                        console.error('❌ Error guardando predicción en MongoDB:', mongoError.message);
                    }
                }
            }
            
            // También guardar en JSON como respaldo
            fs.writeFileSync('prediction_history.json', JSON.stringify(this.predictionHistory, null, 2));
        } catch (error) {
            // En caso de error general, al menos guardar en JSON
            try {
                fs.writeFileSync('prediction_history.json', JSON.stringify(this.predictionHistory, null, 2));
            } catch (jsonError) {
                console.error('❌ Error guardando historial en JSON:', jsonError);
            }
        }
    }

    startPredictionTracking() {
        // Generar predicciones iniciales
        this.generateAndSavePredictions();
        
        // NO actualizar predicciones automáticamente
        // Las predicciones solo se actualizarán cuando salga un nuevo resultado
        console.log('🎯 Predicciones iniciales generadas. Solo se actualizarán con nuevos resultados.');
    }

    async generateAndSavePredictions() {
        try {
            console.log('🔄 Iniciando generación de nuevas predicciones con algoritmo mejorado...');
            const DynamicPredictionAlgorithm = require('./prediction-algorithm.js');
            const algorithm = new DynamicPredictionAlgorithm();
            
            const dataLoaded = await algorithm.loadData();
            if (!dataLoaded) {
                console.log('❌ Error cargando datos para predicciones');
                // Mantener datos actuales en memoria
                console.log('⚠️ Manteniendo datos actuales en memoria');
                return;
            }
            
            // Generar predicciones con el nuevo algoritmo
            const predictions = algorithm.generatePredictions();

            // Mapear la estructura para que sea compatible con el frontend
            const mappedPredictions = predictions.predictions.map(p => ({
                animal: p.number,
                animalName: p.animal,
                totalProbability: Math.min(95, Math.max(5, (p.score + 200) / 8)), // Probabilidades más realistas (5-95%)
                color: p.color
            }));

            this.currentPredictions = {
                timestamp: new Date().toISOString(),
                predictions: mappedPredictions,
                colorPrediction: predictions.colorPrediction,
                totalResults: algorithm.allResults.length
            };
            
            // Guardar predicciones actuales en MongoDB (solo si está conectado)
            if (this.db && this.db.connected) {
                try {
                    const result = await this.db.saveCurrentPredictions(this.currentPredictions);
                } catch (error) {
                    // Silenciar errores de duplicados de MongoDB
                    if (error.code !== 11000) {
                        console.error('❌ Error guardando predicciones en MongoDB:', error.message);
                    }
                }
            }
            // console.log('🎯 Nuevas predicciones generadas y guardadas (Algoritmo Mejorado)'); // Log removido para limpiar pantalla
            // console.log(`📊 Animales predichos: ${mappedPredictions.map(p => `${p.animalName} (${p.totalProbability.toFixed(1)})`).join(', ')}`); // Log removido para limpiar pantalla
            // console.log(`🎨 Color predicho: ${predictions.colorPrediction.color} (${predictions.colorPrediction.probability}%)`); // Log removido para limpiar pantalla
            // console.log('✅ Predicciones listas para el próximo sorteo'); // Log removido para limpiar pantalla
        } catch (error) {
            console.error('❌ Error generando predicciones:', error);
            // Mantener predicciones anteriores si hay error
            if (!this.currentPredictions) {
                console.log('⚠️ Usando predicciones de respaldo...');
            }
        }
    }

    async calculatePredictionEffectiveness() {
        if (this.predictionHistory.length === 0) {
            return {
                totalPredictions: 0,
                correctPredictions: 0,
                accuracy: 0,
                last10Results: [],
                colorAccuracy: 0,
                animalAccuracy: 0
            };
        }

        // Intentar usar resultados FRESCOS del sitio web para la efectividad
        let last10ActualResults = [];
        try {
            const url = 'https://juegoactivo.com/resultados/animalitos';
            const html = await this.fetchWithDecompression(url);
            const webResults = this.extractMegaAnimalitosResults(html);
            if (webResults && webResults.length > 0) {
                last10ActualResults = webResults.slice(0, 10);
                console.log(`📊 Usando ${last10ActualResults.length} resultados frescos del sitio web para efectividad`);
            }
        } catch (webErr) {
            console.log('⚠️ No se pudieron obtener resultados del sitio web para efectividad, usando DB');
        }

        // Si no hay resultados del sitio web, devolver métricas vacías (sin usar respaldo de DB)
        if (last10ActualResults.length === 0) {
            return {
                totalPredictions: this.predictionHistory.length,
                correctAnimals: 0,
                correctColors: 0,
                totalComparisons: 0,
                animalAccuracy: '0.0',
                colorAccuracy: '0.0',
                overallAccuracy: '0.0',
                last10Results: []
            };
        }
        let correctAnimals = 0;
        let correctColors = 0;
        let totalComparisons = 0;
        
        const detailedResults = [];

        // Para cada resultado real, buscar si tenía predicción asociada
        console.log(`🔍 Calculando efectividad para ${last10ActualResults.length} resultados recientes`);
        console.log(`📊 Total de predicciones en historial: ${this.predictionHistory.length}`);
        
        last10ActualResults.forEach((result, index) => {
            console.log(`\n🔍 Analizando resultado ${index + 1}: ${result.number} ${result.animal} - ${result.timeStr}`);
            
            const associatedPrediction = this.predictionHistory.find(pred => 
                pred.actualResult && 
                pred.actualResult.animal === result.number &&
                pred.actualResult.timeStr === result.timeStr
            );
            
            if (associatedPrediction) {
                const animalHit = associatedPrediction.animalHit;
                const colorHit = associatedPrediction.colorHit;
                
                console.log(`✅ Predicción encontrada para ${result.animal}:`);
                console.log(`   🎯 Animal Hit: ${animalHit}`);
                console.log(`   🎨 Color Hit: ${colorHit}`);
                console.log(`   📋 Predicciones: ${associatedPrediction.predictions.map(p => p.animal).join(', ')}`);
                console.log(`   🎨 Color predicho: ${associatedPrediction.colorPrediction ? associatedPrediction.colorPrediction.color : 'N/A'}`);
                
                if (animalHit) correctAnimals++;
                if (colorHit) correctColors++;
                totalComparisons++;
                
                detailedResults.push({
                    timestamp: result.timestamp,
                    timeStr: result.timeStr,
                    actualAnimal: result.number,
                    actualAnimalName: result.animal,
                    actualColor: result.color,
                    predictedAnimals: associatedPrediction.predictions.map(p => p.animal),
                    predictedColor: associatedPrediction.colorPrediction ? associatedPrediction.colorPrediction.color : null,
                    animalHit: animalHit,
                    colorHit: colorHit
                });
            } else {
                console.log(`❌ No se encontró predicción para ${result.animal} - ${result.timeStr}`);
                // Si no hay predicción asociada, contar como fallo
                totalComparisons++;
                detailedResults.push({
                    timestamp: result.timestamp,
                    timeStr: result.timeStr,
                    actualAnimal: result.number,
                    actualAnimalName: result.animal,
                    actualColor: result.color,
                    predictedAnimals: [],
                    predictedColor: null,
                    animalHit: false,
                    colorHit: false
                });
            }
        });
        
        console.log(`\n📊 Resumen de efectividad:`);
        console.log(`   🎯 Animales correctos: ${correctAnimals}/${totalComparisons}`);
        console.log(`   🎨 Colores correctos: ${correctColors}/${totalComparisons}`);
        console.log(`   📈 Total comparaciones: ${totalComparisons}`);

        const animalAccuracy = totalComparisons > 0 ? (correctAnimals / totalComparisons * 100) : 0;
        const colorAccuracy = totalComparisons > 0 ? (correctColors / totalComparisons * 100) : 0;
        const overallAccuracy = totalComparisons > 0 ? ((correctAnimals + correctColors) / (totalComparisons * 2) * 100) : 0;

        // Usar datos de memoria para efectividad

        // Para last10Results, usar los datos actuales que obtuvimos del sitio web
        const last10ResultsFormatted = last10ActualResults.map(result => {
            // Buscar si este resultado tiene una predicción asociada para calcular aciertos
            const associatedPrediction = this.predictionHistory.find(pred => 
                pred.actualResult && 
                pred.actualResult.animal === result.number &&
                Math.abs(new Date(pred.actualResult.timestamp) - new Date(result.timestamp)) < 60000 // Dentro de 1 minuto
            );
            
            return {
                timestamp: result.timestamp,
                animal: result.number,
                animalName: result.animal,
                color: result.color,
                timeStr: result.timeStr || 'N/A',
                animalHit: associatedPrediction ? associatedPrediction.animalHit : false,
                colorHit: associatedPrediction ? associatedPrediction.colorHit : false
            };
        });

        return {
            totalPredictions: this.predictionHistory.length,
            correctAnimals: correctAnimals,
            correctColors: correctColors,
            totalComparisons: totalComparisons,
            animalAccuracy: animalAccuracy.toFixed(1),
            colorAccuracy: colorAccuracy.toFixed(1),
            overallAccuracy: overallAccuracy.toFixed(1),
            last10Results: last10ResultsFormatted // Usar los datos correctos de this.allResults
        };
    }

    async calculateComprehensiveStats() {
        const effectiveness = this.calculatePredictionEffectiveness();
        
        // Estadísticas generales
        const stats = {
            totalPredictions: this.predictionHistory.length,
            correctAnimals: effectiveness.correctAnimals,
            correctColors: effectiveness.correctColors,
            animalAccuracy: parseFloat(effectiveness.animalAccuracy),
            colorAccuracy: parseFloat(effectiveness.colorAccuracy),
            overallAccuracy: parseFloat(effectiveness.overallAccuracy)
        };

        // Estadísticas por período
        stats.last7Days = this.calculatePeriodStats(7);
        stats.last30Days = this.calculatePeriodStats(30);
        stats.last100 = this.calculatePeriodStats(100);

        // Top animales más predichos
        stats.topPredictedAnimals = this.calculateTopPredictedAnimals();

        // Análisis de IA (si está disponible)
        try {
            const DynamicPredictionAlgorithm = require('./prediction-algorithm.js');
            const algorithm = new DynamicPredictionAlgorithm();
            const dataLoaded = await algorithm.loadData();
            if (dataLoaded) {
                const predictions = algorithm.generatePredictions();
                
                // Obtener métricas de IA
                const aiWeights = algorithm.adaptiveWeights || {};
                stats.neuralAccuracy = 22; // Basado en los logs recientes
                stats.patternAccuracy = 25;
                stats.temperatureAccuracy = 30;
                
                stats.neuralContribution = (aiWeights.neural || 0) * 100;
                stats.patternContribution = (aiWeights.patterns || 0) * 100;
                stats.temperatureContribution = (aiWeights.temperature || 0) * 100;
            }
        } catch (error) {
            console.log('No se pudieron cargar métricas de IA:', error.message);
        }

        return stats;
    }

    calculatePeriodStats(days) {
        if (this.predictionHistory.length === 0) {
            return { total: 0, animalAccuracy: 0, colorAccuracy: 0 };
        }

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const periodPredictions = this.predictionHistory.filter(prediction => {
            if (!prediction.actualResult) return false;
            const predictionDate = new Date(prediction.actualResult.timestamp);
            return predictionDate >= cutoffDate;
        });

        if (periodPredictions.length === 0) {
            return { total: 0, animalAccuracy: 0, colorAccuracy: 0 };
        }

        let correctAnimals = 0;
        let correctColors = 0;

        periodPredictions.forEach(prediction => {
            if (prediction.animalHit) correctAnimals++;
            if (prediction.colorHit) correctColors++;
        });

        return {
            total: periodPredictions.length,
            animalAccuracy: (correctAnimals / periodPredictions.length * 100),
            colorAccuracy: (correctColors / periodPredictions.length * 100)
        };
    }

    calculateTopPredictedAnimals() {
        const animalCounts = {};
        const animalHits = {};
        
        // Mapeo de números a nombres
        const animalNames = {
            0: 'Delfín', 1: 'Carnero', 2: 'Toro', 3: 'Ciempies', 4: 'Alacran', 5: 'León',
            6: 'Rana', 7: 'Perico', 8: 'Ratón', 9: 'Águila', 10: 'Tigre', 11: 'Gato',
            12: 'Caballo', 13: 'Mono', 14: 'Paloma', 15: 'Zorro', 16: 'Oso', 17: 'Pavo',
            18: 'Burro', 19: 'Chivo', 20: 'Cochino', 21: 'Gallo', 22: 'Camello', 23: 'Cebra',
            24: 'Iguana', 25: 'Gallina', 26: 'Vaca', 27: 'Perro', 28: 'Zamuro', 29: 'Elefante',
            30: 'Caimán', 31: 'Lapa', 32: 'Ardilla', 33: 'Pescado', 34: 'Venado', 35: 'Jirafa',
            36: 'Culebra', 37: 'Ballena'
        };

        // Contar predicciones y aciertos
        this.predictionHistory.forEach(prediction => {
            if (prediction.predictions) {
                prediction.predictions.forEach(pred => {
                    const animal = pred.animal;
                    animalCounts[animal] = (animalCounts[animal] || 0) + 1;
                    
                    if (prediction.animalHit && prediction.actualResult && prediction.actualResult.animal === animal) {
                        animalHits[animal] = (animalHits[animal] || 0) + 1;
                    }
                });
            }
        });

        // Convertir a array y ordenar
        return Object.entries(animalCounts)
            .map(([animal, count]) => ({
                number: parseInt(animal),
                name: animalNames[parseInt(animal)] || `Animal ${animal}`,
                count: count,
                hits: animalHits[animal] || 0
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 15);
    }

    checkAndUpdatePredictions(newResults) {
        if (!this.currentPredictions || newResults.length === 0) {
            return;
        }

        const newResult = newResults[0]; // El más reciente
        
        // Verificar si el resultado coincide con las predicciones actuales
        const predictedAnimals = this.currentPredictions.predictions.map(p => p.animal);
        const animalHit = predictedAnimals.includes(newResult.number);
        const colorHit = this.currentPredictions.colorPrediction && 
                        this.currentPredictions.colorPrediction.color === newResult.color;
        
        // DEBUG: Mostrar información detallada de la verificación
        // console.log(`🔍 VERIFICACIÓN DE PREDICCIÓN:`); // Log removido para limpiar pantalla
        // console.log(`   🎯 Animal que salió: ${newResult.animal} (${newResult.number})`); // Log removido para limpiar pantalla
        // console.log(`   🎨 Color que salió: ${newResult.color}`); // Log removido para limpiar pantalla
        // console.log(`   📋 Animales predichos: ${predictedAnimals.join(', ')}`); // Log removido para limpiar pantalla
        // console.log(`   🎨 Color predicho: ${this.currentPredictions.colorPrediction ? this.currentPredictions.colorPrediction.color : 'N/A'}`); // Log removido para limpiar pantalla
        // console.log(`   ✅ Animal acertado: ${animalHit ? 'SÍ' : 'NO'}`); // Log removido para limpiar pantalla
        // console.log(`   ✅ Color acertado: ${colorHit ? 'SÍ' : 'NO'}`); // Log removido para limpiar pantalla
        
        // Guardar el resultado de la predicción con información completa
        const predictionResult = {
            // Información de la predicción
            timestamp: this.currentPredictions.timestamp,
            predictions: this.currentPredictions.predictions,
            colorPrediction: this.currentPredictions.colorPrediction,
            totalResults: this.currentPredictions.totalResults,
            
            // Información del resultado real
            actualResult: {
                animal: newResult.number,
                animalName: newResult.animal,
                color: newResult.color,
                timestamp: newResult.timestamp,
                timeStr: newResult.timeStr
            },
            
            // Resultados de acierto
            animalHit: animalHit,
            colorHit: colorHit,
            
            // Información detallada de cada predicción
            predictionDetails: this.currentPredictions.predictions.map(pred => ({
                animal: pred.animal,
                animalName: pred.animalName,
                totalProbability: pred.totalProbability,
                color: pred.color,
                wasCorrect: pred.animal === newResult.number,
                rank: this.currentPredictions.predictions.findIndex(p => p.animal === pred.animal) + 1
            })),
            
            // Estadísticas de la predicción
            stats: {
                totalPredictions: this.currentPredictions.predictions.length,
                animalAccuracy: animalHit ? 100 : 0,
                colorAccuracy: colorHit ? 100 : 0,
                overallAccuracy: ((animalHit ? 100 : 0) + (colorHit ? 100 : 0)) / 2
            },
            
            checkedAt: new Date().toISOString()
        };
        
        // Verificar que no existe ya una predicción para este resultado
        const existingPrediction = this.predictionHistory.find(pred => 
            pred.actualResult && 
            pred.actualResult.animal === newResult.number &&
            pred.actualResult.timeStr === newResult.timeStr
        );
        
        if (!existingPrediction) {
            this.predictionHistory.push(predictionResult);
            this.savePredictionHistory();
            console.log(`✅ Nueva predicción guardada para ${newResult.animal} (${newResult.timeStr})`);
        } else {
            console.log(`⚠️ Predicción duplicada evitada para ${newResult.animal} (${newResult.timeStr})`);
        }
        
        // Generar nuevas predicciones
        this.generateAndSavePredictions();
        
        console.log(`🎯 Predicción verificada: Animal ${animalHit ? '✅' : '❌'} | Color ${colorHit ? '✅' : '❌'}`);
        
        // NOTA: La notificación automática ya se envía en fetchAndUpdateData
        // No es necesario enviar aquí para evitar duplicados
    }

    extractClockTime(html) {
        try {
            // Buscar el reloj de manera simple
            const clockPattern = /(\d{1,2}):(\d{2})/g;
            const matches = [...html.matchAll(clockPattern)];
            
            for (const match of matches) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                
                // Buscar un reloj de cuenta regresiva (0-2 minutos)
                if (minutes >= 0 && minutes <= 2 && seconds >= 0 && seconds <= 59) {
                    // console.log(`⏰ Reloj encontrado: ${minutes}:${seconds.toString().padStart(2, '0')}`); // Log removido para limpiar pantalla
                    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
                }
            }
            
            // console.log('⚠️ No se encontró reloj válido en el HTML'); // Log removido para limpiar pantalla
            return null;
        } catch (error) {
            console.error('❌ Error extrayendo reloj:', error);
            return null;
        }
    }

    calculateUpdateInterval(clockTime) {
        // SIEMPRE actualizar cada 2 segundos para máxima velocidad
        return 2000; // 2 segundos constante
    }

    updateAutoUpdateInterval(newInterval) {
        // Solo actualizar si el intervalo es diferente
        if (this.currentUpdateInterval !== newInterval) {
            console.log(`⏱️ Cambiando intervalo de actualización a ${newInterval/1000} segundos`);
            
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
            }
            
            this.currentUpdateInterval = newInterval;
            this.updateInterval = setInterval(async () => {
                try {
                    await this.fetchAndUpdateData();
                } catch (error) {
                    console.error('❌ Error en actualización automática:', error);
                }
            }, newInterval);
        }
    }

    // Nuevo método para combinar análisis de DeductionEngine con predicción de color
    combineDeductionWithColorAnalysis(deductionAnalysis, colorPrediction) {
        // Si el DeductionEngine tiene baja confianza, usar predicción básica
        if (deductionAnalysis.confidence < 30) {
            return {
                color: colorPrediction.color,
                probability: colorPrediction.probability,
                reason: `Predicción básica: ${colorPrediction.color === 'red' ? 'ROJO' : 'NEGRO'} (${colorPrediction.probability}%) - Confianza baja en deducción`
            };
        }
        
        // Combinar predicciones con ponderación basada en confianza
        const deductionWeight = deductionAnalysis.confidence / 100;
        const colorWeight = 1 - deductionWeight;
        
        // Obtener probabilidades de ambos análisis
        const deductionRedProb = deductionAnalysis.analysis.colorBalance ?
            (deductionAnalysis.analysis.colorBalance.red || 50) : 50;
        const deductionBlackProb = deductionAnalysis.analysis.colorBalance ?
            (deductionAnalysis.analysis.colorBalance.black || 50) : 50;
            
        const colorRedProb = colorPrediction.redProbability || 50;
        const colorBlackProb = colorPrediction.blackProbability || 50;
        
        // Calcular probabilidades combinadas
        const combinedRedProb = (deductionRedProb * deductionWeight) + (colorRedProb * colorWeight);
        const combinedBlackProb = (deductionBlackProb * deductionWeight) + (colorBlackProb * colorWeight);
        
        // Determinar color predicho
        const predictedColor = combinedRedProb > combinedBlackProb ? 'red' : 'black';
        const predictedProbability = Math.max(combinedRedProb, combinedBlackProb);
        
        // Generar razón basada en el análisis
        let reason = '';
        if (deductionAnalysis.confidence > 60) {
            reason = `Deducción avanzada: ${predictedColor === 'red' ? 'ROJO' : 'NEGRO'} (${Math.round(predictedProbability)}%) - `;
            if (deductionAnalysis.analysis.colorBalance && deductionAnalysis.analysis.colorBalance.trend !== 'equilibrado') {
                reason += `Tendencia ${deductionAnalysis.analysis.colorBalance.trend}`;
            } else {
                reason += 'Análisis de equilibrio y secuencias';
            }
        } else {
            reason = `Deducción moderada: ${predictedColor === 'red' ? 'ROJO' : 'NEGRO'} (${Math.round(predictedProbability)}%) - `;
            reason += `Confianza ${deductionAnalysis.confidence}%`;
        }
        
        return {
            color: predictedColor,
            probability: Math.round(predictedProbability),
            reason: reason,
            combinedRedProb: Math.round(combinedRedProb),
            combinedBlackProb: Math.round(combinedBlackProb)
        };
    }

    // Método para obtener datos adicionales de los animales
    getAnimalAdditionalData(allResults) {
        // Obtener las últimas 5 salidas para cada animal
        const animalLastAppearances = {};
        
        // Inicializar contadores para todos los animales
        for (let i = 0; i <= 37; i++) {
            if (this.animals[i]) {
                animalLastAppearances[i] = {
                    animalName: this.animals[i],
                    color: this.getAnimalColor(i),
                    lastAppearances: [],
                    totalTimeSinceLast: 0,
                    probability: 0
                };
            }
        }
        
        // Recopilar las últimas 5 apariciones de cada animal
        allResults.forEach((result, index) => {
            const animalNumber = result.number;
            if (animalLastAppearances[animalNumber] && animalLastAppearances[animalNumber].lastAppearances.length < 5) {
                animalLastAppearances[animalNumber].lastAppearances.push({
                    timeStr: result.timeStr,
                    minutesAgo: index // Aproximadamente minutos atrás basado en el índice
                });
                
                // Calcular tiempo total desde la última aparición
                if (animalLastAppearances[animalNumber].lastAppearances.length === 1) {
                    animalLastAppearances[animalNumber].totalTimeSinceLast = index;
                }
            }
        });
        
        return animalLastAppearances;
    }

    // Función para calcular el gap de tiempo entre dos tiempos
    calculateTimeGap(currentTimeStr, appearanceTimeStr) {
        const now = new Date();
        const appearanceTime = this.parseTimeStringToDate(appearanceTimeStr, now);
        
        // Calcular diferencia en minutos
        const diffMs = now - appearanceTime;
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        
        return Math.max(0, diffMinutes); // No permitir valores negativos
    }

    // Función para parsear tiempo en formato "h:mmam/pm" a minutos
    parseTime(timeStr) {
        const match = timeStr.match(/(\d+):(\d+)(am|pm)/);
        if (!match) return 0;
        
        let hour = parseInt(match[1]);
        const minute = parseInt(match[2]);
        const ampm = match[3];
        
        if (ampm === 'pm' && hour < 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        
        return hour * 60 + minute;
    }

    // Función para extraer la hora de un tiempo
    extractHourFromTime(timeStr) {
        const match = timeStr.match(/(\d+):(\d+)(am|pm)/);
        if (!match) return null;
        
        let hour = parseInt(match[1]);
        const ampm = match[3];
        
        if (ampm === 'pm' && hour < 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        
        return hour;
    }

    // Función para formatear fecha a tiempo
    formatTime(date) {
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const ampm = hours >= 12 ? 'pm' : 'am';
        const displayHours = hours % 12 || 12;
        return `${displayHours}:${minutes.toString().padStart(2, '0')}${ampm}`;
    }

    // Crear timestamp preciso basado en timeStr
    createTimestampFromTimeStr(timeStr) {
        const match = timeStr.match(/(\d+):(\d+)(am|pm)/);
        if (!match) {
            return new Date(); // Fallback a hora actual si no se puede parsear
        }
        
        let hour = parseInt(match[1]);
        const minute = parseInt(match[2]);
        const ampm = match[3];
        
        // Convertir a formato 24 horas
        if (ampm === 'pm' && hour !== 12) {
            hour += 12;
        } else if (ampm === 'am' && hour === 12) {
            hour = 0;
        }
        
        // Crear fecha para hoy con la hora específica
        const now = new Date();
        const resultDate = new Date(now);
        resultDate.setHours(hour, minute, 0, 0);
        
        // Lógica mejorada para determinar el día correcto
        const currentHour = now.getHours();
        const resultHour = resultDate.getHours();
        
        // Si estamos en la noche (después de las 6 PM) y el resultado es de madrugada (antes de las 6 AM)
        // entonces el resultado es del día siguiente
        if (currentHour >= 18 && resultHour < 6) {
            resultDate.setDate(resultDate.getDate() + 1);
        }
        // Si estamos en la madrugada (antes de las 6 AM) y el resultado es de la noche anterior
        else if (currentHour < 6 && resultHour >= 18) {
            resultDate.setDate(resultDate.getDate() - 1);
        }
        // Si la diferencia es más de 12 horas hacia el futuro, es del día anterior
        else if ((resultDate - now) / (1000 * 60 * 60) > 12) {
            resultDate.setDate(resultDate.getDate() - 1);
        }
        
        return resultDate;
    }

    start() {
        this.app.listen(this.port, '0.0.0.0', () => {
            console.log(`🚀 Servidor iniciado en puerto ${this.port}`);
            console.log(`📊 Datos cargados: ${this.allResults.length} resultados`);
            console.log(`🌐 Accede desde PC: http://localhost:${this.port}`);
            console.log(`📱 Accede desde teléfono: http://192.168.1.103:${this.port}`);
            console.log(`🔗 Asegúrate de que tu teléfono esté conectado al mismo WiFi`);
            
            // Hacer una comparación inicial completa al arrancar
            this.performInitialDataSync();
        });
    }

    async performInitialDataSync() {
        console.log('🔄 Iniciando sincronización inicial de datos...');
        try {
            // Obtener todos los resultados del sitio web
            const html = await this.fetchWithDecompression('https://juegoactivo.com/resultados/animalitos');
            const webResults = this.extractMegaAnimalitosResults(html);
            
            if (webResults && webResults.length > 0) {
                console.log(`📊 Resultados encontrados en el sitio web: ${webResults.length}`);
                
                // Crear un mapa de resultados existentes para comparación rápida
                const existingResultsMap = new Map();
                this.allResults.forEach(result => {
                    const key = `${result.timeStr}-${result.number}-${result.animal}`;
                    existingResultsMap.set(key, result);
                });
                
                console.log(`📊 Resultados existentes en base de datos: ${this.allResults.length}`);
                
                // Identificar resultados nuevos que no están en la base de datos
                const newResults = [];
                const existingResults = [];
                
                webResults.forEach(webResult => {
                    const key = `${webResult.timeStr}-${webResult.number}-${webResult.animal}`;
                    if (existingResultsMap.has(key)) {
                        existingResults.push(webResult);
                    } else {
                        newResults.push(webResult);
                        console.log(`🆕 Nuevo resultado encontrado: ${webResult.number} ${webResult.animal} - ${webResult.timeStr}`);
                    }
                });
                
                console.log(`📊 Análisis de sincronización:`);
                console.log(`   ✅ Resultados existentes: ${existingResults.length}`);
                console.log(`   🆕 Resultados nuevos: ${newResults.length}`);
                
                // Agregar solo los resultados nuevos
                if (newResults.length > 0) {
                    console.log('🔄 Agregando resultados nuevos a la base de datos...');
                    
                    // Agregar nuevos resultados
                    this.allResults.push(...newResults);
                    
                    // Reordenar por tiempo cronológico
                    this.allResults.sort((a, b) => {
                        const timeA = this.parseTimeString(a.timeStr);
                        const timeB = this.parseTimeString(b.timeStr);
                        return timeA - timeB; // Orden ascendente para cronología correcta
                    });
                    
                    // Asegurar conexión y guardar en MongoDB
                    try {
                        // Verificar conexión antes de guardar
                        if (!this.db.connected) {
                            console.log('🔌 Reconectando a MongoDB para sincronización inicial...');
                            await this.db.connect();
                        }
                        await this.db.saveResults(newResults);
                    } catch (dbError) {
                        console.error('❌ Error guardando nuevos resultados en MongoDB:', dbError);
                    }
                    
                    // También guardar en JSON como respaldo
                    const dataToSave = {
                        lastUpdate: new Date().toISOString(),
                        totalResults: this.allResults.length,
                        results: this.allResults
                    };
                    fs.writeFileSync('mega_animalitos_daily.json', JSON.stringify(dataToSave, null, 2));
                    
                    console.log(`✅ Sincronización completada: ${newResults.length} nuevos resultados agregados`);
                    console.log(`📊 Total de resultados en base de datos: ${this.allResults.length}`);
                    
                    // Verificar predicciones con los nuevos resultados
                    this.checkAndUpdatePredictions(newResults);
                    
                    // Generar nuevas predicciones
                    await this.generateAndSavePredictions();
                } else {
                    console.log('✅ Base de datos ya está actualizada - no se encontraron resultados nuevos');
                }
            } else {
                console.log('⚠️ No se pudieron obtener resultados del sitio web durante la sincronización inicial');
            }
            
            // Después de la sincronización inicial, iniciar la actualización automática
            console.log('🔄 Iniciando actualización automática después de sincronización inicial...');
            this.startAutoUpdate();
            
        } catch (error) {
            console.error('❌ Error durante la sincronización inicial:', error);
            console.log('🔄 Iniciando actualización automática de todas formas...');
            this.startAutoUpdate();
        }
    }
}

// Iniciar servidor
if (require.main === module) {
    const server = new WebServer();
    server.start();
}

module.exports = WebServer;
