const https = require('https');
const http = require('http');

class TelegramBot {
    constructor() {
        // Configuración del bot de Telegram
        this.botToken = process.env.TELEGRAM_BOT_TOKEN || '7634433496:AAHaeQscZ2szJwt8MQusGZVXORZHxV_w4VY';
        
        // Sistema automático de registro de usuarios
        this.chatIds = new Set();
        this.adminChatId = null; // Chat ID del administrador (se establece dinámicamente)
        this.loadRegisteredUsers();
        this.loadAdmin();
        
        // Agregar usuarios iniciales si existen en variables de entorno
        const initialChatIds = process.env.TELEGRAM_CHAT_IDS ? 
            process.env.TELEGRAM_CHAT_IDS.split(',') : 
            ['6912929677'];  // Chat ID de @Soullinux12
        
        initialChatIds.forEach(chatId => {
            if (chatId && chatId.trim()) {
                this.chatIds.add(chatId.trim());
            }
        });
        
        this.baseUrl = 'https://api.telegram.org/bot';
        this.serverRef = null; // Referencia al servidor
        
        // Configuración para peticiones a la API local
        this.localApiUrl = process.env.LOCAL_API_URL || 'http://localhost';
        this.localApiPort = process.env.PORT || 8000;
        
        // Configuración de alertas
        this.accuracyThreshold = 50; // Umbral de 50% de aciertos
        this.lastNotificationTime = null;
        this.notificationCooldown = 30 * 1000; // 30 segundos entre notificaciones automáticas
        
        // Estado de seguimiento
        this.isHighAccuracyActive = false;
        this.consecutiveHighAccuracy = 0;
        
        // Configuración de polling
        this.pollingInterval = 5000; // 5 segundos
        this.lastUpdateId = 0;
        this.isPolling = false;
        
        // Control de mensajes duplicados
        this.lastWelcomeMessages = new Map(); // Para evitar mensajes de bienvenida duplicados
        this.welcomeCooldown = 60 * 1000; // 1 minuto entre mensajes de bienvenida
        
        // Control de envíos simultáneos
        this.isSendingAutoNotification = false; // Flag para evitar envíos simultáneos
    }

    // Establecer referencia del servidor
    setServerReference(server) {
        this.serverRef = server;
    }

    // Hacer petición HTTP a la API local
    async makeLocalApiRequest(endpoint) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'localhost',
                port: this.localApiPort,
                path: endpoint,
                method: 'GET',
                timeout: 5000 // 5 segundos de timeout
            };

            const req = http.request(options, (res) => {
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    try {
                        if (res.statusCode === 200) {
                            const data = JSON.parse(responseData);
                            resolve(data);
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.end();
        });
    }

    // Cargar usuarios registrados desde archivo
    loadRegisteredUsers() {
        try {
            const fs = require('fs');
            const path = require('path');
            const usersFile = path.join(__dirname, 'registered_users.json');
            
            if (fs.existsSync(usersFile)) {
                const data = fs.readFileSync(usersFile, 'utf8');
                const users = JSON.parse(data);
                users.forEach(chatId => this.chatIds.add(chatId));
                console.log(`📱 Cargados ${users.length} usuarios registrados`);
            } else {
                console.log('📱 No hay usuarios registrados previos');
            }
        } catch (error) {
            console.error('❌ Error cargando usuarios registrados:', error);
        }
    }

    // Guardar usuarios registrados en archivo
    saveRegisteredUsers() {
        try {
            const fs = require('fs');
            const path = require('path');
            const usersFile = path.join(__dirname, 'registered_users.json');
            
            const users = Array.from(this.chatIds);
            fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
            console.log(`💾 Guardados ${users.length} usuarios registrados`);
        } catch (error) {
            console.error('❌ Error guardando usuarios registrados:', error);
        }
    }

    // Cargar administrador desde archivo
    loadAdmin() {
        try {
            const fs = require('fs');
            const path = require('path');
            const adminFile = path.join(__dirname, 'admin.json');
            
            if (fs.existsSync(adminFile)) {
                const data = fs.readFileSync(adminFile, 'utf8');
                const admin = JSON.parse(data);
                this.adminChatId = admin.chatId;
                console.log(`👑 Administrador cargado: ${this.adminChatId}`);
            } else {
                console.log('👑 No hay administrador establecido');
            }
        } catch (error) {
            console.error('❌ Error cargando administrador:', error);
        }
    }

    // Guardar administrador en archivo
    saveAdmin() {
        try {
            const fs = require('fs');
            const path = require('path');
            const adminFile = path.join(__dirname, 'admin.json');
            
            const admin = { chatId: this.adminChatId };
            fs.writeFileSync(adminFile, JSON.stringify(admin, null, 2));
            console.log(`💾 Administrador guardado: ${this.adminChatId}`);
        } catch (error) {
            console.error('❌ Error guardando administrador:', error);
        }
    }

    // Establecer administrador
    setAdmin(chatId) {
        this.adminChatId = chatId;
        this.saveAdmin();
        console.log(`👑 Nuevo administrador establecido: ${chatId}`);
    }

    // Verificar si un usuario es administrador
    isAdmin(chatId) {
        // Hardcodear tu Chat ID como administrador
        const hardcodedAdminId = '6912929677'; // Tu Chat ID como administrador
        const chatIdStr = String(chatId); // Convertir a string para comparación segura
        return this.adminChatId === chatIdStr || chatIdStr === hardcodedAdminId;
    }

    // Manejar comando para transferir administración
    async handleSetAdmin(chatId, text) {
        try {
            // Verificar si el usuario actual es administrador
            if (!this.isAdmin(chatId)) {
                const message = `❌ <b>Acceso Denegado</b>\n\n` +
                               `🔒 Solo el administrador actual puede transferir la administración.\n\n` +
                               `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
                await this.sendMessage(chatId, message);
                return;
            }
            
            // Extraer el Chat ID del comando
            const parts = text.split(' ');
            if (parts.length !== 2) {
                const message = `📝 <b>Uso del comando:</b>\n\n` +
                               `🔧 <code>/setadmin CHAT_ID</code>\n\n` +
                               `📋 <b>Ejemplo:</b>\n` +
                               `<code>/setadmin 1234567890</code>\n\n` +
                               `⚠️ <b>Advertencia:</b> Esto transferirá todos los privilegios de administrador.\n\n` +
                               `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
                await this.sendMessage(chatId, message);
                return;
            }
            
            const newAdminChatId = parts[1].trim();
            
            // Validar que sea un número válido
            if (!/^\d+$/.test(newAdminChatId)) {
                const message = `❌ <b>Chat ID Inválido</b>\n\n` +
                               `🔢 El Chat ID debe ser solo números.\n` +
                               `📝 Ejemplo: <code>/setadmin 1234567890</code>\n\n` +
                               `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
                await this.sendMessage(chatId, message);
                return;
            }
            
            // Verificar que el nuevo admin esté registrado
            if (!this.chatIds.has(newAdminChatId)) {
                const message = `❌ <b>Usuario No Registrado</b>\n\n` +
                               `👤 El Chat ID <code>${newAdminChatId}</code> no está registrado.\n` +
                               `📝 Primero debe usar /start para registrarse.\n\n` +
                               `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
                await this.sendMessage(chatId, message);
                return;
            }
            
            // Transferir administración
            const oldAdminChatId = this.adminChatId;
            this.setAdmin(newAdminChatId);
            
            const message = `✅ <b>Administración Transferida Exitosamente</b>\n\n` +
                           `👑 <b>Nuevo administrador:</b> <code>${newAdminChatId}</code>\n` +
                           `📊 <b>Administrador anterior:</b> <code>${oldAdminChatId}</code>\n\n` +
                           `⚠️ <b>Ya no tienes privilegios de administrador.</b>\n\n` +
                           `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
            
            await this.sendMessage(chatId, message);
            
            // Notificar al nuevo administrador
            const newAdminMessage = `👑 <b>¡Eres el Nuevo Administrador!</b>\n\n` +
                                   `✅ La administración ha sido transferida a tu cuenta.\n` +
                                   `🔧 Ahora puedes usar comandos de administrador:\n` +
                                   `• /adduser - Agregar usuarios\n` +
                                   `• /setadmin - Transferir administración\n` +
                                   `• /users - Ver usuarios registrados\n\n` +
                                   `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
            
            await this.sendMessage(newAdminChatId, newAdminMessage);
            
        } catch (error) {
            console.error('❌ Error transfiriendo administración:', error);
            const errorMessage = `❌ <b>Error Transfiriendo Administración</b>\n\n` +
                                `🔧 Ocurrió un error al procesar la solicitud.\n` +
                                `📝 Verifica el formato: <code>/setadmin CHAT_ID</code>\n\n` +
                                `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
            await this.sendMessage(chatId, errorMessage);
        }
    }

    // Registrar nuevo usuario automáticamente
    registerUser(chatId, userName = 'Usuario') {
        if (!this.chatIds.has(chatId)) {
            this.chatIds.add(chatId);
            this.saveRegisteredUsers();
            console.log(`✅ Nuevo usuario registrado: ${userName} (${chatId})`);
            return true; // Nuevo usuario
        }
        return false; // Usuario ya existía
    }

    // Obtener lista de usuarios registrados
    getRegisteredUsers() {
        return Array.from(this.chatIds);
    }

    // Iniciar polling para recibir mensajes
    startPolling() {
        if (this.isPolling) {
            console.log('⚠️ Polling ya está activo');
            return;
        }
        
        this.isPolling = true;
        console.log('🤖 Bot de Telegram iniciado con polling');
        
        // Activar notificaciones automáticas por defecto
        this.isHighAccuracyActive = true;
        console.log('🔔 Notificaciones automáticas activadas por defecto');
        
        this.pollUpdates();
    }

    // Detener polling
    stopPolling() {
        this.isPolling = false;
        console.log('🛑 Polling detenido');
    }

    // Función de polling para recibir actualizaciones
    async pollUpdates() {
        while (this.isPolling) {
            try {
                await this.getUpdates();
                this.cleanupOldWelcomeMessages(); // Limpiar mensajes antiguos
                await this.sleep(this.pollingInterval);
            } catch (error) {
                console.error('❌ Error en polling:', error);
                await this.sleep(this.pollingInterval * 2); // Esperar más tiempo si hay error
            }
        }
    }

    // Obtener actualizaciones del bot
    async getUpdates() {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.telegram.org',
                port: 443,
                path: `/bot${this.botToken}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=1`,
                method: 'GET'
            };

            const req = https.request(options, (res) => {
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const data = JSON.parse(responseData);
                        if (data.ok && data.result) {
                            this.processUpdates(data.result);
                        }
                        resolve(data);
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.end();
        });
    }

    // Procesar actualizaciones recibidas
    processUpdates(updates) {
        updates.forEach(update => {
            if (update.update_id > this.lastUpdateId) {
                this.lastUpdateId = update.update_id;
            }

            if (update.message) {
                this.handleMessage(update.message);
            }
        });
    }

    // Manejar mensajes recibidos
    handleMessage(message) {
        const chatId = message.chat.id;
        const text = message.text || '';
        const fromUser = message.from?.first_name || 'Usuario';

        console.log(`📨 Mensaje recibido de ${fromUser} (${chatId}): ${text}`);

        // Extraer el comando base (sin parámetros)
        const command = text.split(' ')[0].toLowerCase();

        // Comandos del bot
        switch (command) {
            case '/start':
                // Verificar si ya se envió un mensaje de bienvenida recientemente
                const now = Date.now();
                const lastWelcome = this.lastWelcomeMessages.get(chatId);
                
                if (lastWelcome && (now - lastWelcome) < this.welcomeCooldown) {
                    console.log(`⏰ Mensaje de bienvenida ignorado para ${chatId} (cooldown activo)`);
                    return;
                }
                
                // Registrar usuario automáticamente
                const isNewUser = this.registerUser(chatId, fromUser);
                
                // Si no hay administrador establecido, el primer usuario se convierte en administrador
                if (!this.adminChatId) {
                    this.setAdmin(chatId);
                    console.log(`👑 Primer usuario ${fromUser} (${chatId}) se convierte en administrador`);
                }
                
                let welcomeMessage = `¡Hola ${fromUser}! 🤖\n\nSoy el bot de predicciones de lotería.`;
                
                if (isNewUser) {
                    welcomeMessage += `\n\n✅ <b>¡Bienvenido! Has sido registrado automáticamente.</b>`;
                    
                    // Si es el primer usuario (administrador), agregar mensaje especial
                    if (this.isAdmin(chatId) && this.chatIds.size === 1) {
                        welcomeMessage += `\n\n👑 <b>¡Eres el administrador del sistema!</b>`;
                        welcomeMessage += `\n🔧 Puedes usar /adduser para agregar otros usuarios.`;
                    }
                } else {
                    welcomeMessage += `\n\n👋 <b>¡Bienvenido de vuelta!</b>`;
                    
                    // Si es administrador, mostrar información adicional
                    if (this.isAdmin(chatId)) {
                        welcomeMessage += `\n👑 <b>Eres administrador del sistema.</b>`;
                    }
                }
                
                welcomeMessage += `\n\n📋 <b>Comandos disponibles:</b>\n` +
                                `• /status - Ver estado del sistema\n` +
                                `• /predictions - Obtener predicciones actuales (Top 10)\n` +
                                `• /last - Ver últimos 10 resultados\n` +
                                `• /stats - Ver efectividad de últimas 10 predicciones\n` +
                                `• /auto - Activar notificaciones automáticas\n` +
                                `• /auto-off o /autostop - Desactivar notificaciones automáticas\n` +
                                `• /help - Ver ayuda\n\n` +
                                `🎯 <b>¡Comienza a usar los comandos para obtener predicciones!</b>`;
                
                // Registrar el tiempo del mensaje de bienvenida
                this.lastWelcomeMessages.set(chatId, now);
                
                this.sendMessage(chatId, welcomeMessage);
                break;
            
            case '/status':
                this.sendSystemStatus(chatId);
                break;
            
            case '/predictions':
                this.sendCurrentPredictions(chatId);
                break;
            
            case '/last':
                this.sendLastResults(chatId);
                break;
            
            case '/stats':
                this.sendPredictionStats(chatId);
                break;
            
            case '/auto':
                this.activateAutoNotifications(chatId);
                break;
            
            case '/auto-off':
            case '/autostop':
                this.deactivateAutoNotifications(chatId);
                break;
            
            case '/users':
                this.sendRegisteredUsers(chatId);
                break;
            
            case '/adduser':
                this.handleAddUser(chatId, text);
                break;
            
            case '/help':
                this.sendHelp(chatId);
                break;
            
            case '/myid':
                this.sendMyId(chatId);
                break;
            
            case '/setadmin':
                this.handleSetAdmin(chatId, text);
                break;
            
            default:
                this.sendMessage(chatId, `Comando no reconocido. Usa /help para ver los comandos disponibles.`);
                break;
        }
    }

    // Enviar mensaje a un chat específico
    async sendMessage(chatId, message) {
        return new Promise((resolve, reject) => {
            const encodedMessage = encodeURIComponent(message);
            
            const options = {
                hostname: 'api.telegram.org',
                port: 443,
                path: `/bot${this.botToken}/sendMessage?chat_id=${chatId}&text=${encodedMessage}&parse_mode=HTML`,
                method: 'GET'
            };

            const req = https.request(options, (res) => {
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        console.log(`✅ Mensaje enviado a chat ${chatId}`);
                        resolve(responseData);
                    } else {
                        console.error(`❌ Error enviando mensaje a ${chatId}: Status ${res.statusCode}`);
                        reject(new Error(`HTTP ${res.statusCode}`));
                    }
                });
            });

            req.on('error', (error) => {
                console.error(`❌ Error de red para ${chatId}:`, error);
                reject(error);
            });

            req.end();
        });
    }

    // Enviar mensaje a todos los chats configurados
    async sendMessageToAll(message) {
        // Convertir Set a Array y filtrar Chat IDs válidos
        const validChatIds = Array.from(this.chatIds).filter(chatId => 
            chatId && typeof chatId === 'string' && chatId.trim() !== '' && 
            !chatId.includes('YOUR_CHAT_ID') && chatId !== 'YOUR_CHAT_ID_1' && chatId !== 'YOUR_CHAT_ID_2'
        );
        
        if (validChatIds.length === 0) {
            console.log('⚠️ No hay usuarios registrados. Envía /start al bot para registrarte.');
            return;
        }
        
        const promises = validChatIds.map(chatId => {
            return this.sendMessage(chatId, message);
        });

        try {
            await Promise.all(promises);
            console.log(`✅ Mensajes enviados a ${validChatIds.length} usuarios de Telegram`);
        } catch (error) {
            console.error('❌ Error enviando a algunos usuarios:', error);
            throw error;
        }
    }

    // Enviar estado del sistema
    async sendSystemStatus(chatId) {
        const totalUsers = this.chatIds.size;
        const message = `📊 <b>Estado del Sistema</b>\n\n` +
                       `🤖 Bot: <b>Activo</b> ✅\n` +
                       `📡 Polling: <b>${this.isPolling ? 'Activo' : 'Inactivo'}</b>\n` +
                       `👥 Usuarios registrados: <b>${totalUsers}</b>\n` +
                       `🎯 Umbral de precisión: <b>${this.accuracyThreshold}%</b>\n` +
                       `⏰ Última notificación: <b>${this.lastNotificationTime ? new Date(this.lastNotificationTime).toLocaleString('es-ES', { timeZone: 'America/Caracas' }) : 'Nunca'}</b>\n\n` +
                       `🔄 Sistema funcionando correctamente`;
        
        await this.sendMessage(chatId, message);
    }



    // Enviar usuarios registrados
    async sendRegisteredUsers(chatId) {
        const users = this.getRegisteredUsers();
        const totalUsers = users.length;
        
        let message = `👥 <b>Usuarios Registrados</b> 👥\n\n` +
                     `📊 <b>Total de usuarios:</b> ${totalUsers}\n\n`;
        
        if (totalUsers > 0) {
            message += `📋 <b>Lista de Chat IDs:</b>\n`;
            users.forEach((userId, index) => {
                message += `${index + 1}. ${userId}\n`;
            });
        } else {
            message += `❌ No hay usuarios registrados aún`;
        }
        
        message += `\n\n⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
        
        await this.sendMessage(chatId, message);
    }

    // Enviar ayuda
    async sendHelp(chatId) {
        let message = `📚 <b>Comandos del Bot</b>\n\n` +
                     `/start - Iniciar el sistema\n` +
                     `/status - Ver estado del sistema\n` +
                     `/predictions - Obtener predicciones actuales (Top 10)\n` +
                     `/last - Ver últimos 10 resultados\n` +
                     `/stats - Ver efectividad de últimas 10 predicciones\n` +
                     `/auto - Activar notificaciones automáticas\n` +
                     `/auto-off o /autostop - Desactivar notificaciones automáticas\n` +
                     `/myid - Ver tu Chat ID\n` +
                     `/users - Ver usuarios registrados\n` +
                     `/help - Ver esta ayuda\n\n`;
        
        // Agregar comandos de administrador si el usuario es admin
        if (this.isAdmin(chatId)) {
            message += `👑 <b>Comandos de Administrador:</b>\n` +
                      `/adduser - Agregar nuevo usuario\n` +
                      `/setadmin - Transferir administración\n\n`;
        }
        
        message += `🎯 Con /auto recibirás automáticamente:\n` +
                  `• Último resultado cuando salga\n` +
                  `• Nuevas predicciones (Top 10) cuando se generen\n\n` +
                  `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
        
        await this.sendMessage(chatId, message);
    }

    // Enviar Chat ID del usuario
    async sendMyId(chatId) {
        const message = `🆔 <b>Tu Chat ID</b>\n\n` +
                       `📱 <b>ID:</b> <code>${chatId}</code>\n\n` +
                       `💡 <b>Para agregar este ID al sistema:</b>\n` +
                       `1. Copia el ID de arriba\n` +
                       `2. Envíalo al administrador\n` +
                       `3. O agrégalo manualmente al archivo de configuración\n\n` +
                       `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
        
        await this.sendMessage(chatId, message);
    }

    // Manejar comando para agregar usuario
    async handleAddUser(chatId, text) {
        try {
            // Debug: Verificar qué Chat ID está llegando
            console.log(`🔍 DEBUG - Chat ID recibido: ${chatId} (tipo: ${typeof chatId})`);
            console.log(`🔍 DEBUG - Es admin: ${this.isAdmin(chatId)}`);
            
            // Verificar si el usuario es administrador
            if (!this.isAdmin(chatId)) {
                const message = `❌ <b>Acceso Denegado</b>\n\n` +
                               `🔒 Solo el administrador puede agregar usuarios.\n` +
                               `📱 Contacta al administrador para ser agregado.\n\n` +
                               `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
                await this.sendMessage(chatId, message);
                return;
            }
            
            // Extraer el Chat ID del comando
            const parts = text.split(' ');
            if (parts.length !== 2) {
                const message = `📝 <b>Uso del comando:</b>\n\n` +
                               `🔧 <code>/adduser CHAT_ID</code>\n\n` +
                               `📋 <b>Ejemplo:</b>\n` +
                               `<code>/adduser 1234567890</code>\n\n` +
                               `💡 <b>Para obtener un Chat ID:</b>\n` +
                               `1. El usuario debe escribir /myid\n` +
                               `2. Copiar el ID que aparece\n` +
                               `3. Usar este comando con ese ID\n\n` +
                               `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
                await this.sendMessage(chatId, message);
                return;
            }
            
            const newChatId = parts[1].trim();
            
            // Validar que sea un número válido
            if (!/^\d+$/.test(newChatId)) {
                const message = `❌ <b>Chat ID Inválido</b>\n\n` +
                               `🔢 El Chat ID debe ser solo números.\n` +
                               `📝 Ejemplo: <code>/adduser 1234567890</code>\n\n` +
                               `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
                await this.sendMessage(chatId, message);
                return;
            }
            
            // Verificar si ya existe
            if (this.chatIds.has(newChatId)) {
                const message = `⚠️ <b>Usuario Ya Existe</b>\n\n` +
                               `👤 El Chat ID <code>${newChatId}</code> ya está registrado.\n` +
                               `📊 Total de usuarios: <b>${this.chatIds.size}</b>\n\n` +
                               `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
                await this.sendMessage(chatId, message);
                return;
            }
            
            // Agregar el nuevo usuario
            this.chatIds.add(newChatId);
            this.saveRegisteredUsers();
            
            const message = `✅ <b>Usuario Agregado Exitosamente</b>\n\n` +
                           `👤 <b>Nuevo usuario:</b> <code>${newChatId}</code>\n` +
                           `📊 <b>Total de usuarios:</b> ${this.chatIds.size}\n` +
                           `💾 <b>Guardado en:</b> registered_users.json\n\n` +
                           `🎯 <b>El usuario ahora recibirá:</b>\n` +
                           `• Notificaciones automáticas\n` +
                           `• Predicciones actualizadas\n` +
                           `• Alertas del sistema\n\n` +
                           `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
            
            await this.sendMessage(chatId, message);
            
            // Enviar mensaje de bienvenida al nuevo usuario
            const welcomeMessage = `🎉 <b>¡Bienvenido al Sistema de Predicciones!</b>\n\n` +
                                  `✅ Has sido agregado exitosamente por el administrador.\n` +
                                  `🎯 Ahora recibirás automáticamente:\n` +
                                  `• Últimos resultados cuando salgan\n` +
                                  `• Nuevas predicciones cuando se generen\n` +
                                  `• Alertas importantes del sistema\n\n` +
                                  `📋 <b>Comandos disponibles:</b>\n` +
                                  `/predictions - Ver predicciones actuales\n` +
                                  `/last - Ver últimos resultados\n` +
                                  `/stats - Ver efectividad\n` +
                                  `/auto - Activar notificaciones\n` +
                                  `/help - Ver todos los comandos\n\n` +
                                  `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
            
            await this.sendMessage(newChatId, welcomeMessage);
            
        } catch (error) {
            console.error('❌ Error agregando usuario:', error);
            const errorMessage = `❌ <b>Error Agregando Usuario</b>\n\n` +
                                `🔧 Ocurrió un error al procesar la solicitud.\n` +
                                `📝 Verifica el formato: <code>/adduser CHAT_ID</code>\n\n` +
                                `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
            await this.sendMessage(chatId, errorMessage);
        }
    }

    // Enviar predicciones actuales
    async sendCurrentPredictions(chatId) {
        try {
            let predictions = [];
            let colorPrediction = null;
            let effectiveness = null;

            // Intentar obtener datos desde la API local primero
            try {
                const apiResponse = await this.makeLocalApiRequest('/api/predictions');
                if (apiResponse.success) {
                    predictions = apiResponse.predictions || [];
                    colorPrediction = apiResponse.colorPrediction;
                    effectiveness = apiResponse.effectiveness;
                    console.log('🌐 Datos obtenidos desde API local para predicciones');
                }
            } catch (apiError) {
                console.log('⚠️ Error obteniendo datos de API local, usando referencia del servidor:', apiError.message);
                
                // Usar referencia del servidor como respaldo
                if (this.serverRef) {
                    predictions = this.serverRef.currentPredictions?.predictions || [];
                    colorPrediction = this.serverRef.currentPredictions?.colorPrediction;
                    effectiveness = this.serverRef.calculatePredictionEffectiveness ? this.serverRef.calculatePredictionEffectiveness() : null;
                } else {
                    await this.sendMessage(chatId, '❌ Error: No hay conexión con el servidor ni con la API local');
                    return;
                }
            }
            
            if (predictions && predictions.length > 0) {
                const top10 = predictions.slice(0, 10); // Top 10 predicciones
                
                let message = `🎯 <b>PREDICCIONES ACTUALES</b> 🎯\n\n`;
                
                if (effectiveness) {
                    message += `📊 <b>Efectividad:</b> ${effectiveness.overallAccuracy}%\n`;
                }
                
                if (colorPrediction) {
                    const colorEmoji = colorPrediction.color === 'red' ? '🔴' : colorPrediction.color === 'black' ? '⚫' : '🟢';
                    message += `🎨 <b>Color Predicho:</b> ${colorEmoji} ${colorPrediction.color.toUpperCase()} (${colorPrediction.probability}%)\n`;
                }
                
                message += `\n🦁 <b>Top 10 Animales:</b>\n`;
                
                top10.forEach((pred, index) => {
                    const tempEmoji = pred.temperature === 'hot' ? '🔥' : pred.temperature === 'warm' ? '🌤️' : pred.temperature === 'cold' ? '❄️' : '';
                    message += `${index + 1}. ${pred.animal.toString().padStart(2, '0')} ${pred.animalName} ${tempEmoji} (${pred.totalProbability.toFixed(1)}%)\n`;
                });
                
                message += `\n⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
                
                await this.sendMessage(chatId, message);
            } else {
                await this.sendMessage(chatId, '❌ No hay predicciones disponibles en este momento');
            }
        } catch (error) {
            console.error('Error enviando predicciones:', error);
            await this.sendMessage(chatId, '❌ Error obteniendo predicciones');
        }
    }

    // Enviar últimos 10 resultados
    async sendLastResults(chatId) {
        try {
            let results = [];

            // Intentar obtener datos desde la API local primero
            try {
                const apiResponse = await this.makeLocalApiRequest('/api/last-results');
                if (apiResponse.success) {
                    results = apiResponse.results || [];
                    console.log('🌐 Datos obtenidos desde API local para últimos resultados');
                }
            } catch (apiError) {
                console.log('⚠️ Error obteniendo datos de API local, usando referencia del servidor:', apiError.message);
                
                // Usar referencia del servidor como respaldo
                if (this.serverRef) {
                    results = this.serverRef.allResults || [];
                } else {
                    await this.sendMessage(chatId, '❌ Error: No hay conexión con el servidor ni con la API local');
                    return;
                }
            }
            
            if (results && results.length > 0) {
                const last10 = results.slice(0, 10);
                
                let message = `📊 <b>ÚLTIMOS 10 RESULTADOS</b> 📊\n\n`;
                
                last10.forEach((result, index) => {
                    const colorEmoji = result.color === 'red' ? '🔴' : result.color === 'black' ? '⚫' : '🟢';
                    const time = result.timeStr || 'Sin hora';
                    message += `${index + 1}. ${result.number.toString().padStart(2, '0')} ${result.animal} ${colorEmoji} - ${time}\n`;
                });
                
                message += `\n⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
                
                await this.sendMessage(chatId, message);
            } else {
                await this.sendMessage(chatId, '❌ No hay resultados disponibles en este momento');
            }
        } catch (error) {
            console.error('Error enviando últimos resultados:', error);
            await this.sendMessage(chatId, '❌ Error obteniendo últimos resultados');
        }
    }

    // Enviar estadísticas de predicciones
    async sendPredictionStats(chatId) {
        try {
            let effectiveness = null;

            // Intentar obtener datos desde la API local primero
            try {
                const apiResponse = await this.makeLocalApiRequest('/api/effectiveness');
                if (apiResponse.success) {
                    effectiveness = apiResponse.effectiveness;
                    console.log('🌐 Datos obtenidos desde API local para estadísticas');
                }
            } catch (apiError) {
                console.log('⚠️ Error obteniendo datos de API local, usando referencia del servidor:', apiError.message);
                
                // Usar referencia del servidor como respaldo
                if (this.serverRef) {
                    effectiveness = this.serverRef.calculatePredictionEffectiveness ? this.serverRef.calculatePredictionEffectiveness() : null;
                } else {
                    await this.sendMessage(chatId, '❌ Error: No hay conexión con el servidor ni con la API local');
                    return;
                }
            }

            // Crear mensaje con los datos de efectividad
            let message = `📊 <b>EFECTIVIDAD DE PREDICCIONES</b> 📊\n\n`;
            
            message += `📈 <b>RESUMEN GENERAL:</b>\n`;
            message += `🦁 <b>Animales:</b> ${effectiveness.animalAccuracy}% (${effectiveness.correctAnimals}/${effectiveness.totalComparisons})\n`;
            message += `🎨 <b>Colores:</b> ${effectiveness.colorAccuracy}% (${effectiveness.correctColors}/${effectiveness.totalComparisons})\n`;
            message += `🎯 <b>General:</b> ${effectiveness.overallAccuracy}%\n`;
            message += `📊 <b>Total predicciones:</b> ${effectiveness.totalPredictions}\n\n`;
            
            // Mostrar últimos resultados si están disponibles
            if (effectiveness.last10Results && effectiveness.last10Results.length > 0) {
                message += `📋 <b>ÚLTIMAS ${effectiveness.last10Results.length} PREDICCIONES:</b>\n`;
                
                effectiveness.last10Results.forEach((result, index) => {
                    const animalEmoji = result.animalHit ? '✅' : '❌';
                    const colorEmoji = result.colorHit ? '✅' : '❌';
                    const resultColorEmoji = result.color === 'red' ? '🔴' : 
                                           result.color === 'black' ? '⚫' : '🟢';
                    
                    message += `${index + 1}. ${result.timeStr || 'Sin hora'}\n`;
                    message += `   🎯 Salió: ${result.animal} ${result.animalName} ${resultColorEmoji}\n`;
                    message += `   🔮 Animal: ${animalEmoji} | Color: ${colorEmoji}\n\n`;
                });
            }
            
            message += `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
            
            await this.sendMessage(chatId, message);
            
        } catch (error) {
            console.error('Error enviando estadísticas:', error);
            await this.sendMessage(chatId, '❌ Error obteniendo estadísticas de predicciones');
        }
    }

    // Activar notificaciones automáticas
    async activateAutoNotifications(chatId) {
        try {
            // Verificar si ya está activo
            if (this.isHighAccuracyActive) {
                await this.sendMessage(chatId, '🔔 Las notificaciones automáticas ya están ACTIVADAS');
                return;
            }
            
            // Activar notificaciones
            this.isHighAccuracyActive = true;
            this.consecutiveHighAccuracy = 0;
            
            const message = `🔔 <b>NOTIFICACIONES AUTOMÁTICAS ACTIVADAS</b> 🔔\n\n` +
                           `✅ Recibirás automáticamente:\n` +
                           `• Último resultado cuando salga\n` +
                           `• Nuevas predicciones cuando se generen\n\n` +
                           `📱 Para desactivar: /auto-off\n` +
                           `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
            
            await this.sendMessage(chatId, message);
            
            // Enviar inmediatamente el último resultado y predicciones actuales
            await this.sendCurrentStatus(chatId);
            
            console.log(`🔔 Notificaciones automáticas activadas por usuario ${chatId}`);
            
        } catch (error) {
            console.error('Error activando notificaciones:', error);
            await this.sendMessage(chatId, '❌ Error activando notificaciones automáticas');
        }
    }

    // Desactivar notificaciones automáticas
    async deactivateAutoNotifications(chatId) {
        try {
            // Verificar si ya está inactivo
            if (!this.isHighAccuracyActive) {
                await this.sendMessage(chatId, '🔕 Las notificaciones automáticas ya están DESACTIVADAS');
                return;
            }
            
            // Desactivar notificaciones
            this.isHighAccuracyActive = false;
            this.consecutiveHighAccuracy = 0;
            
            const message = `🔕 <b>NOTIFICACIONES AUTOMÁTICAS DESACTIVADAS</b> 🔕\n\n` +
                           `❌ Ya no recibirás notificaciones automáticas\n` +
                           `💡 Usa /auto-on para reactivarlas cuando quieras\n` +
                           `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
            
            await this.sendMessage(chatId, message);
        } catch (error) {
            console.error('Error desactivando notificaciones:', error);
            await this.sendMessage(chatId, '❌ Error desactivando notificaciones automáticas');
        }
    }

    // Enviar estado actual (último resultado + predicciones)
    async sendCurrentStatus(chatId) {
        try {
            let results = [];
            let predictions = [];
            let colorPrediction = null;

            // Intentar obtener datos desde la API local primero
            try {
                // Obtener últimos resultados
                const resultsResponse = await this.makeLocalApiRequest('/api/last-results');
                if (resultsResponse.success) {
                    results = resultsResponse.results || [];
                }

                // Obtener predicciones
                const predictionsResponse = await this.makeLocalApiRequest('/api/predictions');
                if (predictionsResponse.success) {
                    predictions = predictionsResponse.predictions || [];
                    colorPrediction = predictionsResponse.colorPrediction;
                }

                console.log('🌐 Datos obtenidos desde API local para estado actual');
            } catch (apiError) {
                console.log('⚠️ Error obteniendo datos de API local, usando referencia del servidor:', apiError.message);
                
                // Usar referencia del servidor como respaldo
                if (this.serverRef) {
                    results = this.serverRef.allResults || [];
                    predictions = this.serverRef.currentPredictions?.predictions || [];
                    colorPrediction = this.serverRef.currentPredictions?.colorPrediction;
                } else {
                    await this.sendMessage(chatId, '❌ Error: No hay conexión con el servidor ni con la API local');
                    return;
                }
            }

            // 1. Enviar último resultado
            if (results.length > 0) {
                const lastResult = results[0]; // El más reciente está al inicio
                const colorEmoji = lastResult.color === 'red' ? '🔴' : lastResult.color === 'black' ? '⚫' : '🟢';
                const time = lastResult.timeStr || 'Sin hora';
                
                // Obtener información de acierto si está disponible
                let hitInfo = '';
                if (lastResult.animalHit !== undefined || lastResult.colorHit !== undefined) {
                    const animalHit = lastResult.animalHit ? '✅' : '❌';
                    const colorHit = lastResult.colorHit ? '✅' : '❌';
                    hitInfo = `\n🎯 Animal: ${animalHit} | Color: ${colorHit}`;
                }
                
                const resultMessage = `📊 <b>NUEVO RESULTADO</b> 📊\n\n` +
                                    `🎯 ${lastResult.number.toString().padStart(2, '0')} ${lastResult.animal} ${colorEmoji}${hitInfo}\n` +
                                    `⏰ ${time}\n\n` +
                                    `🔄 <b>Generando nuevas predicciones...</b>\n\n` +
                                    `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
                
                await this.sendMessage(chatId, resultMessage);
                
                // Esperar un momento antes de enviar las predicciones
                await this.sleep(2000);
            }

            // 2. Enviar predicciones actuales
            
            if (predictions && predictions.length > 0) {
                let message = `🎯 <b>PREDICCIONES ACTUALIZADAS</b> 🎯\n\n`;
                
                if (colorPrediction && colorPrediction.color) {
                    const colorEmoji = colorPrediction.color === 'red' ? '🔴' : colorPrediction.color === 'black' ? '⚫' : '🟢';
                    message += `🎨 <b>Color Predicho:</b> ${colorEmoji} ${colorPrediction.color.toUpperCase()} (${colorPrediction.probability || 0}%)\n\n`;
                }
                
                message += `🦁 <b>Top 10 Animales:</b>\n`;
                predictions.slice(0, 10).forEach((pred, index) => {
                    const tempEmoji = pred.temperature === 'hot' ? '🔥' : pred.temperature === 'warm' ? '🌤️' : pred.temperature === 'cold' ? '❄️' : '';
                    const colorEmoji = pred.color === 'red' ? '🔴' : pred.color === 'black' ? '⚫' : '🟢';
                    message += `${index + 1}. ${pred.animal.toString().padStart(2, '0')} ${pred.animalName} ${colorEmoji} ${tempEmoji} (${pred.totalProbability.toFixed(1)}%)\n`;
                });
                
                message += `\n⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
                
                await this.sendMessage(chatId, message);
            } else {
                // Si no hay predicciones, enviar mensaje informativo
                const noPredictionsMessage = `🎯 <b>PREDICCIONES ACTUALES</b> 🎯\n\n` +
                                           `⏳ <b>No hay predicciones disponibles en este momento</b>\n` +
                                           `🔄 El sistema está generando nuevas predicciones...\n\n` +
                                           `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
                await this.sendMessage(chatId, noPredictionsMessage);
            }
            
        } catch (error) {
            console.error('Error enviando estado actual:', error);
            await this.sendMessage(chatId, '❌ Error obteniendo estado actual');
        }
    }

    // Verificar si debemos enviar notificación
    shouldSendNotification() {
        const now = Date.now();
        
        // Si no hemos enviado notificación recientemente
        if (!this.lastNotificationTime || (now - this.lastNotificationTime) > this.notificationCooldown) {
            return true;
        }
        
        return false;
    }

    // Verificar si debemos enviar notificación automática
    shouldSendAutoNotification() {
        // Solo verificar que no estemos enviando otra notificación simultáneamente
        if (this.isSendingAutoNotification) {
            return false;
        }
        
        return true; // Permitir envío siempre que no haya otro en progreso
    }



    // Analizar efectividad y enviar alerta si es necesario
    async checkAndNotify(effectiveness) {
        try {
            // Si las notificaciones automáticas están activadas, enviar siempre
            if (this.isHighAccuracyActive && this.shouldSendAutoNotification()) {
                this.isSendingAutoNotification = true; // Marcar que estamos enviando
                await this.sendAutoNotification(effectiveness);
                this.isSendingAutoNotification = false; // Desmarcar
            }
            
            // Verificar si alcanzamos 50% de aciertos y enviar alerta especial
            await this.check50PercentAccuracy(effectiveness);
            
        } catch (error) {
            console.error('❌ Error verificando notificaciones:', error);
            this.isSendingAutoNotification = false; // Asegurar que se desmarque en caso de error
        }
    }

    // Enviar notificación automática con último resultado y predicciones
    async sendAutoNotification(effectiveness) {
        try {
            // Convertir Set a Array y filtrar Chat IDs válidos
            const validChatIds = Array.from(this.chatIds).filter(chatId => 
                chatId && typeof chatId === 'string' && chatId.trim() !== '' && 
                !chatId.includes('YOUR_CHAT_ID') && chatId !== 'YOUR_CHAT_ID_1' && chatId !== 'YOUR_CHAT_ID_2'
            );
            
            if (validChatIds.length === 0) {
                console.log('⚠️ No hay usuarios registrados para enviar notificación automática');
                return;
            }
            
            console.log(`🔔 Enviando notificación automática a ${validChatIds.length} usuarios...`);
            
            // Enviar estado actual a todos los usuarios activos
            const promises = validChatIds.map(chatId => {
                return this.sendCurrentStatus(chatId);
            });

            await Promise.all(promises);
            console.log(`✅ Notificación automática enviada exitosamente a ${validChatIds.length} usuarios`);
            
        } catch (error) {
            console.error('❌ Error enviando notificación automática:', error);
        }
    }

    // Enviar alerta de alta precisión
    async sendHighAccuracyAlert(effectiveness) {
        const animalAccuracy = parseFloat(effectiveness.animalAccuracy);
        const colorAccuracy = parseFloat(effectiveness.colorAccuracy);
        const overallAccuracy = parseFloat(effectiveness.overallAccuracy);
        
        const message = `🚨 <b>¡ALTA PRECISIÓN DETECTADA!</b> 🚨\n\n` +
                       `🎯 <b>Efectividad Actual:</b>\n` +
                       `• Animales: <b>${animalAccuracy}%</b> ✅\n` +
                       `• Colores: <b>${colorAccuracy}%</b> ✅\n` +
                       `• General: <b>${overallAccuracy}%</b> ✅\n\n` +
                       `📊 <b>Estadísticas:</b>\n` +
                       `• Total predicciones: ${effectiveness.totalPredictions}\n` +
                       `• Animales acertados: ${effectiveness.correctAnimals}/${effectiveness.totalComparisons}\n` +
                       `• Colores acertados: ${effectiveness.correctColors}/${effectiveness.totalComparisons}\n\n` +
                       `🔥 <b>¡El sistema está funcionando excelentemente!</b>\n` +
                       `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
        
        await this.sendMessageToAll(message);
    }

    // Enviar alerta de caída de precisión
    async sendAccuracyDropAlert(effectiveness) {
        const animalAccuracy = parseFloat(effectiveness.animalAccuracy);
        const colorAccuracy = parseFloat(effectiveness.colorAccuracy);
        const overallAccuracy = parseFloat(effectiveness.overallAccuracy);
        
        const message = `📉 <b>Precisión ha bajado</b> 📉\n\n` +
                       `🎯 <b>Efectividad Actual:</b>\n` +
                       `• Animales: <b>${animalAccuracy}%</b>\n` +
                       `• Colores: <b>${colorAccuracy}%</b>\n` +
                       `• General: <b>${overallAccuracy}%</b>\n\n` +
                       `⚠️ <b>El sistema necesita ajustes</b>\n` +
                       `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
        
        await this.sendMessageToAll(message);
    }

    // Enviar notificación de prueba
    async sendTestMessage() {
        const message = `🧪 <b>Prueba de Bot de Telegram</b> 🧪\n\n` +
                       `✅ El sistema de alertas está funcionando correctamente\n` +
                       `🎯 Se activará cuando la precisión supere el ${this.accuracyThreshold}%\n` +
                       `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
        
        await this.sendMessageToAll(message);
    }

    // Verificar si alcanzamos 50% de aciertos y enviar alerta
    async check50PercentAccuracy(effectiveness) {
        try {
            if (!effectiveness) return;
            
            const animalAccuracy = parseFloat(effectiveness.animalAccuracy);
            const colorAccuracy = parseFloat(effectiveness.colorAccuracy);
            const overallAccuracy = parseFloat(effectiveness.overallAccuracy);
            
            // Verificar SOLO si los ANIMALES alcanzan o superan 50%
            const hasReached50 = animalAccuracy >= 50;
            
            if (hasReached50) {
                // Verificar si ya enviamos esta alerta recientemente (evitar spam)
                const now = Date.now();
                const lastAlertTime = this.last50PercentAlertTime || 0;
                const alertCooldown = 30 * 60 * 1000; // 30 minutos entre alertas
                
                if (now - lastAlertTime > alertCooldown) {
                    await this.send50PercentAlert(effectiveness);
                    this.last50PercentAlertTime = now;
                }
            }
            
        } catch (error) {
            console.error('❌ Error verificando 50% de aciertos:', error);
        }
    }

    // Enviar alerta de 50% de aciertos
    async send50PercentAlert(effectiveness) {
        try {
            const animalAccuracy = parseFloat(effectiveness.animalAccuracy);
            const colorAccuracy = parseFloat(effectiveness.colorAccuracy);
            const overallAccuracy = parseFloat(effectiveness.overallAccuracy);
            
            const message = `🚨 <b>¡50% DE ACIERTOS EN ANIMALES ALCANZADO!</b> 🚨\n\n` +
                           `🎉 <b>¡EXCELENTE RENDIMIENTO!</b>\n\n` +
                           `🦁 <b>Animales: ${animalAccuracy}%</b> ✅\n` +
                           `📈 <b>Estadísticas completas:</b>\n` +
                           `• Animales: ${animalAccuracy}% (${effectiveness.correctAnimals}/${effectiveness.totalComparisons})\n` +
                           `• Colores: ${colorAccuracy}% (${effectiveness.correctColors}/${effectiveness.totalComparisons})\n` +
                           `• General: ${overallAccuracy}%\n` +
                           `• Total predicciones: ${effectiveness.totalPredictions}\n\n` +
                           `🔥 <b>¡El sistema está funcionando de manera excepcional!</b>\n` +
                           `💡 Es un buen momento para considerar aumentar las apuestas\n\n` +
                           `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
            
            await this.sendMessageToAll(message);
            console.log(`🎉 Alerta de 50% de aciertos en animales enviada a Telegram`);
            
        } catch (error) {
            console.error('❌ Error enviando alerta de 50%:', error);
        }
    }

    // Enviar resumen diario
    async sendDailySummary(effectiveness) {
        const animalAccuracy = parseFloat(effectiveness.animalAccuracy);
        const colorAccuracy = parseFloat(effectiveness.colorAccuracy);
        const overallAccuracy = parseFloat(effectiveness.overallAccuracy);
        
        const message = `📊 <b>Resumen Diario</b> 📊\n\n` +
                       `🎯 <b>Efectividad del Día:</b>\n` +
                       `• Animales: <b>${animalAccuracy}%</b>\n` +
                       `• Colores: <b>${colorAccuracy}%</b>\n` +
                       `• General: <b>${overallAccuracy}%</b>\n\n` +
                       `📈 <b>Estadísticas:</b>\n` +
                       `• Total predicciones: ${effectiveness.totalPredictions}\n` +
                       `• Animales acertados: ${effectiveness.correctAnimals}\n` +
                       `• Colores acertados: ${effectiveness.correctColors}\n\n` +
                       `⏰ ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}`;
        
        await this.sendMessageToAll(message);
    }

    // Función auxiliar para esperar
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Limpiar mensajes de bienvenida antiguos
    cleanupOldWelcomeMessages() {
        const now = Date.now();
        const cutoffTime = now - this.welcomeCooldown;
        
        for (const [chatId, timestamp] of this.lastWelcomeMessages.entries()) {
            if (timestamp < cutoffTime) {
                this.lastWelcomeMessages.delete(chatId);
            }
        }
    }
}

module.exports = TelegramBot;
