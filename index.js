require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');

const Database = require('better-sqlite3');

/* =========================
   CONFIGURACIÓN CLIENTE
========================= */

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

/* =========================
   BASE DE DATOS SQLITE
========================= */

const db = new Database('./database.sqlite');

db.pragma('journal_mode = WAL');

/* =========================
   CREAR TABLAS
========================= */

db.prepare(`
CREATE TABLE IF NOT EXISTS detenciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    enemigo TEXT NOT NULL,
    grupo_rival TEXT NOT NULL,
    motivo TEXT NOT NULL,
    tiempo_minutos INTEGER NOT NULL,
    capturado_por TEXT NOT NULL,
    capturado_por_id TEXT NOT NULL,
    fecha TEXT NOT NULL
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS advertencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    miembro TEXT NOT NULL,
    miembro_id TEXT NOT NULL,
    motivo TEXT NOT NULL,
    advertencia_por TEXT NOT NULL,
    advertencia_por_id TEXT NOT NULL,
    fecha TEXT NOT NULL
)
`).run();

/* =========================
   SLASH COMMANDS
========================= */

const commands = [

    new SlashCommandBuilder()
        .setName('registrar_detencion')
        .setDescription('Registra la captura.')
        .addStringOption(option =>
            option.setName('enemigo')
                .setDescription('Nombre del enemigo')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('grupo_rival')
                .setDescription('Grupo rival')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('motivo')
                .setDescription('Motivo de la captura')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('tiempo_minutos')
                .setDescription('Tiempo en minutos')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('historial_detenciones')
        .setDescription('Muestra las detenciones del servidor actual.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('poner_advertencia')
        .setDescription('Suma advertencia a un miembro.')
        .addUserOption(option =>
            option.setName('miembro_faccion')
                .setDescription('Miembro')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('motivo')
                .setDescription('Motivo')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('historial_advertencias')
        .setDescription('Muestra las advertencias del miembro.')
        .addUserOption(option =>
            option.setName('miembro_faccion')
                .setDescription('Miembro')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('registro_personal')
        .setDescription('Registra qué miembro hizo la detención.')
        .addUserOption(option =>
            option.setName('miembro_faccion')
                .setDescription('Miembro')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('historial_registro_personal')
        .setDescription('Ranking de miembros con más detenciones.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('tiempo_total_capturados')
        .setDescription('Suma total de minutos capturados.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('tiempo_captura_enemigo')
        .setDescription('Tiempo total de un enemigo específico.')
        .addStringOption(option =>
            option.setName('enemigo')
                .setDescription('Nombre del enemigo')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

].map(command => command.toJSON());

/* =========================
   REGISTRO AUTOMÁTICO
========================= */

client.once('ready', async () => {

    console.log(`✅ Bot conectado como ${client.user.tag}`);

    try {

        const rest = new REST({ version: '10' })
            .setToken(process.env.DISCORD_TOKEN);

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );

        console.log('✅ Slash Commands registrados globalmente.');

    } catch (error) {
        console.error('❌ Error registrando comandos:', error);
    }

});

/* =========================
   VERIFICAR ADMIN
========================= */

function esAdministrador(interaction) {
    return interaction.memberPermissions.has(PermissionFlagsBits.Administrator);
}

/* =========================
   INTERACCIONES
========================= */

client.on('interactionCreate', async interaction => {

    if (!interaction.isChatInputCommand()) return;

    if (!esAdministrador(interaction)) {
        return interaction.reply({
            content: '❌ Solo los administradores pueden usar este comando.',
            ephemeral: true
        });
    }

    const guildId = interaction.guild.id;

    /* =====================================
       /registrar_detencion
    ===================================== */

    if (interaction.commandName === 'registrar_detencion') {

        const enemigo = interaction.options.getString('enemigo');
        const grupoRival = interaction.options.getString('grupo_rival');
        const motivo = interaction.options.getString('motivo');
        const tiempo = interaction.options.getInteger('tiempo_minutos');

        db.prepare(`
            INSERT INTO detenciones (
                guild_id,
                enemigo,
                grupo_rival,
                motivo,
                tiempo_minutos,
                capturado_por,
                capturado_por_id,
                fecha
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            guildId,
            enemigo,
            grupoRival,
            motivo,
            tiempo,
            interaction.user.tag,
            interaction.user.id,
            new Date().toLocaleString()
        );

        const embed = new EmbedBuilder()
            .setTitle('✅ Detención Registrada')
            .addFields(
                { name: 'Enemigo', value: enemigo },
                { name: 'Grupo Rival', value: grupoRival },
                { name: 'Motivo', value: motivo },
                { name: 'Tiempo', value: `${tiempo} minutos` },
                { name: 'Registrado por', value: interaction.user.tag }
            );

        return interaction.reply({ embeds: [embed] });
    }

    /* =====================================
       /historial_detenciones
    ===================================== */

    if (interaction.commandName === 'historial_detenciones') {

        const rows = db.prepare(`
            SELECT * FROM detenciones
            WHERE guild_id = ?
            ORDER BY id DESC
            LIMIT 20
        `).all(guildId);

        if (!rows.length) {
            return interaction.reply('❌ No hay detenciones registradas.');
        }

        const texto = rows.map(r =>
            `• ${r.enemigo} | ${r.grupo_rival} | ${r.tiempo_minutos} min | ${r.fecha}`
        ).join('\n');

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('📋 Historial de Detenciones')
                    .setDescription(texto)
            ]
        });
    }

    /* =====================================
       /poner_advertencia
    ===================================== */

    if (interaction.commandName === 'poner_advertencia') {

        const miembro = interaction.options.getUser('miembro_faccion');
        const motivo = interaction.options.getString('motivo');

        db.prepare(`
            INSERT INTO advertencias (
                guild_id,
                miembro,
                miembro_id,
                motivo,
                advertencia_por,
                advertencia_por_id,
                fecha
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            guildId,
            miembro.tag,
            miembro.id,
            motivo,
            interaction.user.tag,
            interaction.user.id,
            new Date().toLocaleString()
        );

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('⚠️ Advertencia Registrada')
                    .addFields(
                        { name: 'Miembro', value: miembro.tag },
                        { name: 'Motivo', value: motivo },
                        { name: 'Registrada por', value: interaction.user.tag }
                    )
            ]
        });
    }

    /* =====================================
       /historial_advertencias
    ===================================== */

    if (interaction.commandName === 'historial_advertencias') {

        const miembro = interaction.options.getUser('miembro_faccion');

        const rows = db.prepare(`
            SELECT * FROM advertencias
            WHERE guild_id = ?
            AND miembro_id = ?
            ORDER BY id DESC
        `).all(guildId, miembro.id);

        if (!rows.length) {
            return interaction.reply('❌ Este miembro no tiene advertencias.');
        }

        const texto = rows.map(r =>
            `• ${r.motivo} | ${r.fecha}`
        ).join('\n');

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle(`⚠️ Advertencias de ${miembro.tag}`)
                    .setDescription(texto)
            ]
        });
    }

    /* =====================================
       /registro_personal
    ===================================== */

    if (interaction.commandName === 'registro_personal') {

        const miembro = interaction.options.getUser('miembro_faccion');

        const total = db.prepare(`
            SELECT COUNT(*) as cantidad
            FROM detenciones
            WHERE guild_id = ?
            AND capturado_por_id = ?
        `).get(guildId, miembro.id);

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('👮 Registro Personal')
                    .addFields(
                        { name: 'Miembro', value: miembro.tag },
                        { name: 'Detenciones realizadas', value: `${total.cantidad}` }
                    )
            ]
        });
    }

    /* =====================================
       /historial_registro_personal
    ===================================== */

    if (interaction.commandName === 'historial_registro_personal') {

        const ranking = db.prepare(`
            SELECT capturado_por,
            COUNT(*) as total
            FROM detenciones
            WHERE guild_id = ?
            GROUP BY capturado_por_id
            ORDER BY total DESC
            LIMIT 10
        `).all(guildId);

        if (!ranking.length) {
            return interaction.reply('❌ No hay registros.');
        }

        const texto = ranking.map((r, i) =>
            `#${i + 1} ${r.capturado_por} - ${r.total} detenciones`
        ).join('\n');

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🏆 Ranking de Detenciones')
                    .setDescription(texto)
            ]
        });
    }

    /* =====================================
       /tiempo_total_capturados
    ===================================== */

    if (interaction.commandName === 'tiempo_total_capturados') {

        const resultado = db.prepare(`
            SELECT SUM(tiempo_minutos) as total
            FROM detenciones
            WHERE guild_id = ?
        `).get(guildId);

        const total = resultado.total || 0;

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('⏱️ Tiempo Total Capturados')
                    .setDescription(`Total acumulado: ${total} minutos`)
            ]
        });
    }

    /* =====================================
       /tiempo_captura_enemigo
    ===================================== */

    if (interaction.commandName === 'tiempo_captura_enemigo') {

        const enemigo = interaction.options.getString('enemigo');

        const resultado = db.prepare(`
            SELECT SUM(tiempo_minutos) as total
            FROM detenciones
            WHERE guild_id = ?
            AND enemigo = ?
        `).get(guildId, enemigo);

        const total = resultado.total || 0;

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🎯 Tiempo de Captura')
                    .addFields(
                        { name: 'Enemigo', value: enemigo },
                        { name: 'Tiempo total', value: `${total} minutos` }
                    )
            ]
        });
    }

});

/* =========================
   LOGIN
========================= */

client.login(process.env.DISCORD_TOKEN);