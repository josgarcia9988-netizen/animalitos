const { MongoClient, ServerApiVersion } = require('mongodb');

class DatabaseManager {
    constructor() {
        // Usar variables de entorno para las credenciales
        const username = process.env.MONGODB_USERNAME || 'josgarcia9988';
        const password = process.env.MONGODB_PASSWORD || 'Chuchu2412..';
        const cluster = process.env.MONGODB_CLUSTER || 'cluster0.cjgqs9q.mongodb.net';
        const database = process.env.MONGODB_DATABASE || 'animalitos_db';
        
        // URI con configuración específica para Render
        this.uri = `mongodb+srv://${username}:${password}@${cluster}/${database}?retryWrites=true&w=1&appName=Cluster0&maxPoolSize=1&minPoolSize=0&maxIdleTimeMS=10000&connectTimeoutMS=10000&socketTimeoutMS=30000&serverSelectionTimeoutMS=10000&heartbeatFrequencyMS=10000&retryReads=true&readPreference=primary&writeConcern=1`;
        
        this.client = new MongoClient(this.uri, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: false,
                deprecationErrors: false,
            },
            // Configuración específica para Render
            maxPoolSize: 1,
            minPoolSize: 0,
            maxIdleTimeMS: 10000,
            connectTimeoutMS: 10000,
            socketTimeoutMS: 30000,
            serverSelectionTimeoutMS: 10000,
            heartbeatFrequencyMS: 10000,
            retryWrites: true,
            retryReads: true,
            // Configuración para evitar problemas de red
            readPreference: 'primary',
            writeConcern: { w: 1, j: false },
            // Configuración SSL específica para Render
            ssl: true,
            tls: true,
            tlsAllowInvalidCertificates: false,
            tlsAllowInvalidHostnames: false,
            // Configuración adicional para estabilidad
            directConnection: false,
            compressors: ['zlib'],
            zlibCompressionLevel: 6
        });
        this.db = null;
        this.connected = false;
        this.lastConnectionAttempt = 0;
        this.connectionCooldown = 30000; // 30 segundos entre intentos
    }

    async connect() {
        try {
            // Evitar múltiples intentos de conexión simultáneos
            const now = Date.now();
            if (now - this.lastConnectionAttempt < this.connectionCooldown) {
                console.log('⏳ Esperando antes de intentar reconectar...');
                return false;
            }
            
            this.lastConnectionAttempt = now;
            
            if (this.connected) {
                return true;
            }

            console.log('🔌 Conectando a MongoDB Atlas...');
            console.log(`📊 Usando cluster: ${process.env.MONGODB_CLUSTER || 'cluster0.cjgqs9q.mongodb.net'}`);
            
            // Conexión con timeout específico para Render
            const connectPromise = this.client.connect();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Connection timeout')), 15000)
            );
            
            await Promise.race([connectPromise, timeoutPromise]);
            
            // Seleccionar base de datos
            this.db = this.client.db(process.env.MONGODB_DATABASE || "animalitos_db");
            
            // Verificar conexión con ping
            await this.client.db("admin").command({ ping: 1 });
            
            this.connected = true;
            console.log("✅ Conectado exitosamente a MongoDB Atlas!");
            
            // Crear índices necesarios
            await this.createIndexes();
            
            return true;
        } catch (error) {
            console.error("❌ Error conectando a MongoDB:", error.message);
            this.connected = false;
            
            // Si es un error de red específico, intentar configuración alternativa
            if (error.message.includes('connection') || error.message.includes('closed')) {
                console.log('🔄 Error de conexión detectado, intentando configuración alternativa...');
                return await this.connectWithAlternativeConfig();
            }
            
            return false;
        }
    }

    async connectWithAlternativeConfig() {
        try {
            console.log('🔧 Aplicando configuración alternativa para Render...');
            
            // Cerrar conexión existente
            if (this.client) {
                await this.client.close();
            }
            
            // Crear URI con configuración más permisiva
            const username = process.env.MONGODB_USERNAME || 'josgarcia9988';
            const password = process.env.MONGODB_PASSWORD || 'Chuchu2412..';
            const cluster = process.env.MONGODB_CLUSTER || 'cluster0.cjgqs9q.mongodb.net';
            const database = process.env.MONGODB_DATABASE || 'animalitos_db';
            
            // URI con configuración más permisiva para Render
            const alternativeUri = `mongodb+srv://${username}:${password}@${cluster}/${database}?retryWrites=true&w=1&appName=Cluster0&maxPoolSize=1&minPoolSize=0&maxIdleTimeMS=5000&connectTimeoutMS=5000&socketTimeoutMS=15000&serverSelectionTimeoutMS=5000&heartbeatFrequencyMS=5000&retryReads=true&readPreference=nearest&writeConcern=1&ssl=false&tls=false`;
            
            console.log('🔧 Usando configuración alternativa sin SSL...');
            
            // Crear nuevo cliente con configuración más permisiva
            this.client = new MongoClient(alternativeUri, {
                serverApi: {
                    version: ServerApiVersion.v1,
                    strict: false,
                    deprecationErrors: false,
                },
                maxPoolSize: 1,
                minPoolSize: 0,
                maxIdleTimeMS: 5000,
                connectTimeoutMS: 5000,
                socketTimeoutMS: 15000,
                serverSelectionTimeoutMS: 5000,
                heartbeatFrequencyMS: 5000,
                retryWrites: true,
                retryReads: true,
                readPreference: 'nearest',
                writeConcern: { w: 1, j: false },
                ssl: false,
                tls: false
            });
            
            console.log('🔧 Intentando conectar con configuración alternativa...');
            await this.client.connect();
            
            // Seleccionar base de datos
            this.db = this.client.db(process.env.MONGODB_DATABASE || "animalitos_db");
            
            // Verificar conexión
            await this.client.db("admin").command({ ping: 1 });
            
            this.connected = true;
            console.log("✅ Conectado exitosamente con configuración alternativa!");
            
            // Crear índices necesarios
            await this.createIndexes();
            
            return true;
        } catch (error) {
            console.error("❌ Error con configuración alternativa:", error.message);
            this.connected = false;
            return false;
        }
    }

    async createIndexes() {
        try {
            const resultsCollection = this.db.collection("results");
            const predictionsCollection = this.db.collection("prediction_history");
            
            // Índice para resultados - evitar duplicados
            await resultsCollection.createIndex(
                { "timeStr": 1, "number": 1, "animal": 1 }, 
                { unique: true, background: true }
            );
            
            // Índice para timestamp de resultados
            await resultsCollection.createIndex(
                { "timestamp": -1 }, 
                { background: true }
            );
            
            // Índice para predicciones por timestamp
            await predictionsCollection.createIndex(
                { "timestamp": -1 }, 
                { background: true }
            );
            
            console.log("📊 Índices creados exitosamente");
        } catch (error) {
            // Los errores de índices duplicados son normales
            if (!error.message.includes('already exists')) {
                console.error("⚠️ Error creando índices:", error.message);
            }
        }
    }

    async disconnect() {
        try {
            if (this.client) {
                await this.client.close();
                this.connected = false;
                console.log("🔌 Desconectado de MongoDB");
            }
        } catch (error) {
            console.error("❌ Error desconectando:", error);
        }
    }

    async reconnect() {
        try {
            console.log("🔄 Reconectando a MongoDB...");
            
            // Cerrar conexión existente si existe
            if (this.client) {
                await this.client.close();
            }
            
            // Crear nuevo cliente con configuración simple
            const username = process.env.MONGODB_USERNAME || 'josgarcia9988';
            const password = process.env.MONGODB_PASSWORD || 'Chuchu2412..';
            const cluster = process.env.MONGODB_CLUSTER || 'cluster0.cjgqs9q.mongodb.net';
            const database = process.env.MONGODB_DATABASE || 'animalitos_db';
            
            this.uri = `mongodb+srv://${username}:${password}@${cluster}/${database}?retryWrites=true&w=1&appName=Cluster0&maxPoolSize=1&minPoolSize=0&maxIdleTimeMS=10000&connectTimeoutMS=10000&socketTimeoutMS=30000&serverSelectionTimeoutMS=10000&heartbeatFrequencyMS=10000&retryReads=true&readPreference=primary&writeConcern=1`;
            
            this.client = new MongoClient(this.uri, {
                serverApi: {
                    version: ServerApiVersion.v1,
                    strict: false,
                    deprecationErrors: false,
                },
                maxPoolSize: 1,
                minPoolSize: 0,
                maxIdleTimeMS: 10000,
                connectTimeoutMS: 10000,
                socketTimeoutMS: 30000,
                serverSelectionTimeoutMS: 10000,
                heartbeatFrequencyMS: 10000,
                retryWrites: true,
                retryReads: true,
                readPreference: 'primary',
                writeConcern: { w: 1, j: false },
                ssl: true,
                tls: true,
                tlsAllowInvalidCertificates: false,
                tlsAllowInvalidHostnames: false,
                directConnection: false,
                compressors: ['zlib'],
                zlibCompressionLevel: 6
            });
            
            await this.connect();
        } catch (error) {
            console.error("❌ Error reconectando:", error.message);
            this.connected = false;
        }
    }

    // Operaciones para resultados de animalitos
    async saveResults(results) {
        if (!this.connected) {
            throw new Error("No conectado a MongoDB");
        }

        try {
            const collection = this.db.collection("results");
            
            if (Array.isArray(results)) {
                // Insertar múltiples resultados
                const operations = results.map(result => ({
                    updateOne: {
                        filter: { 
                            timeStr: result.timeStr, 
                            number: result.number, 
                            animal: result.animal 
                        },
                        update: { $set: result },
                        upsert: true
                    }
                }));
                
                const result = await collection.bulkWrite(operations, { ordered: false });
                console.log(`💾 Guardados ${result.upsertedCount} nuevos resultados, ${result.modifiedCount} actualizados`);
                return result;
            } else {
                // Insertar un solo resultado
                const result = await collection.updateOne(
                    { 
                        timeStr: results.timeStr, 
                        number: results.number, 
                        animal: results.animal 
                    },
                    { $set: results },
                    { upsert: true }
                );
                
                if (result.upsertedCount > 0) {
                    console.log(`💾 Nuevo resultado guardado: ${results.number} ${results.animal} - ${results.timeStr}`);
                }
                return result;
            }
        } catch (error) {
            console.error("❌ Error guardando resultados:", error);
            throw error;
        }
    }

    async getResults(limit = null, skip = 0) {
        if (!this.connected) {
            throw new Error("No conectado a MongoDB");
        }

        try {
            const collection = this.db.collection("results");
            let query = collection
                .find({})
                .sort({ timestamp: -1, _id: -1 }) // Más recientes primero, con _id como desempate
                .skip(skip);
            
            // Solo aplicar límite si se especifica
            if (limit !== null && limit > 0) {
                query = query.limit(limit);
            }
            
            const results = await query.toArray();
            
            console.log(`📊 Obtenidos ${results.length} resultados de MongoDB${limit ? ` (límite: ${limit})` : ' (sin límite)'}`);
            return results;
        } catch (error) {
            console.error("❌ Error obteniendo resultados:", error);
            throw error;
        }
    }

    async getResultsCount() {
        if (!this.connected) {
            throw new Error("No conectado a MongoDB");
        }

        try {
            const collection = this.db.collection("results");
            const count = await collection.countDocuments();
            return count;
        } catch (error) {
            console.error("❌ Error contando resultados:", error);
            throw error;
        }
    }

    // Operaciones para historial de predicciones
    async savePredictionHistory(prediction) {
        if (!this.connected) {
            throw new Error("No conectado a MongoDB");
        }

        try {
            const collection = this.db.collection("prediction_history");
            
            // Remover _id si existe para evitar conflictos de duplicados
            const predictionToSave = { ...prediction };
            delete predictionToSave._id;
            
            const result = await collection.insertOne(predictionToSave);
            console.log(`🎯 Predicción guardada en historial: ${result.insertedId}`);
            return result;
        } catch (error) {
            // Solo mostrar errores que no sean de duplicados
            if (error.code !== 11000) {
                console.error("❌ Error guardando predicción:", error);
            }
            throw error;
        }
    }

    async getPredictionHistory(limit = null) {
        if (!this.connected) {
            throw new Error("No conectado a MongoDB");
        }

        try {
            const collection = this.db.collection("prediction_history");
            let query = collection
                .find({})
                .sort({ timestamp: -1 });
            
            // Solo aplicar límite si se especifica
            if (limit !== null && limit > 0) {
                query = query.limit(limit);
            }
            
            const history = await query.toArray();
            
            console.log(`🎯 Obtenidas ${history.length} predicciones del historial${limit ? ` (límite: ${limit})` : ' (sin límite)'}`);
            return history;
        } catch (error) {
            console.error("❌ Error obteniendo historial de predicciones:", error);
            throw error;
        }
    }

    // Operaciones para predicciones actuales
    async saveCurrentPredictions(predictions) {
        if (!this.connected) {
            throw new Error("No conectado a MongoDB");
        }

        try {
            const collection = this.db.collection("current_predictions");
            
            // Reemplazar las predicciones actuales (solo mantenemos las más recientes)
            await collection.deleteMany({});
            const result = await collection.insertOne({
                ...predictions,
                savedAt: new Date()
            });
            
            console.log(`🎯 Predicciones actuales guardadas: ${result.insertedId}`);
            return result;
        } catch (error) {
            console.error("❌ Error guardando predicciones actuales:", error);
            throw error;
        }
    }

    async getCurrentPredictions() {
        if (!this.connected) {
            throw new Error("No conectado a MongoDB");
        }

        try {
            const collection = this.db.collection("current_predictions");
            const predictions = await collection.findOne({}, { sort: { savedAt: -1 } });
            
            if (predictions) {
                console.log(`🎯 Predicciones actuales obtenidas de MongoDB`);
                // Remover el _id y savedAt para compatibilidad
                delete predictions._id;
                delete predictions.savedAt;
            }
            
            return predictions;
        } catch (error) {
            console.error("❌ Error obteniendo predicciones actuales:", error);
            throw error;
        }
    }

    // Migración de datos desde archivos JSON
    async migrateFromJSON() {
        console.log('🔄 Iniciando migración de datos JSON a MongoDB...');
        
        try {
            // Migrar resultados
            const fs = require('fs');
            
            if (fs.existsSync('mega_animalitos_daily.json')) {
                console.log('📁 Migrando mega_animalitos_daily.json...');
                const data = fs.readFileSync('mega_animalitos_daily.json', 'utf8');
                const parsedData = JSON.parse(data);
                const results = Array.isArray(parsedData) ? parsedData : (parsedData.results || []);
                
                if (results.length > 0) {
                    await this.saveResults(results);
                    console.log(`✅ Migrados ${results.length} resultados`);
                }
            }

            // Migrar historial de predicciones
            if (fs.existsSync('prediction_history.json')) {
                console.log('📁 Migrando prediction_history.json...');
                const historyData = fs.readFileSync('prediction_history.json', 'utf8');
                const history = JSON.parse(historyData);
                
                if (history.length > 0) {
                    const collection = this.db.collection("prediction_history");
                    const result = await collection.insertMany(history, { ordered: false });
                    console.log(`✅ Migradas ${result.insertedCount} predicciones del historial`);
                }
            }

            console.log('🎉 Migración completada exitosamente!');
            return true;
        } catch (error) {
            console.error('❌ Error durante la migración:', error);
            return false;
        }
    }

    // Método de respaldo - crear backup de MongoDB a JSON
    async backupToJSON() {
        try {
            console.log('💾 Creando backup de MongoDB a archivos JSON...');
            const fs = require('fs');
            
            // Backup de resultados
            const results = await this.getResults(10000); // Obtener hasta 10k resultados
            const backupData = {
                lastUpdate: new Date().toISOString(),
                totalResults: results.length,
                results: results
            };
            
            fs.writeFileSync('mongo_backup_results.json', JSON.stringify(backupData, null, 2));
            
            // Backup de historial de predicciones
            const history = await this.getPredictionHistory(1000);
            fs.writeFileSync('mongo_backup_predictions.json', JSON.stringify(history, null, 2));
            
            console.log('✅ Backup completado: mongo_backup_results.json y mongo_backup_predictions.json');
            return true;
        } catch (error) {
            console.error('❌ Error creando backup:', error);
            return false;
        }
    }
}

module.exports = DatabaseManager;
