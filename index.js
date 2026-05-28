require('dotenv').config();

const express = require('express');
const app = express();

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ChannelType
} = require('discord.js');

const Database = require('better-sqlite3');

/* =========================
   EXPRESS PARA RAILWAY
========================= */

app.get('/', (req, res) => {
    res.send('Bot activo');
});

app.listen(process.env.PORT || 3000, () => {
    console.log('Servidor web iniciado');
});

/* =========================
   CLIENTE DISCORD
========================= */

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

/* =========================
   SQLITE
========================= */

const db = new Database('./database.sqlite');

db.prepare(`
CREATE TABLE IF NOT EXISTS detenciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT,
    enemigo TEXT,
    grupo_rival TEXT,
    motivo TEXT,
    tiempo_minutos INTEGER,
    usuario TEXT,
    fecha TEXT
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS advertencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT,
    miembro TEXT,
    motivo TEXT,
    admin TEXT,
    fecha TEXT
)
`).run();

/* =========================
   SLASH COMMANDS
========================= */

const commands = [

    new SlashCommandBuilder()
        .setName('setup_bot')
        .setDescription('Crear canales del sistema')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('registrar_detencion')
        .setDescription('Registrar detención')
        .addStringOption(option =>
            option.setName('enemigo')
                .setDescription('Nombre enemigo')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('grupo_rival')
                .setDescription('Grupo rival')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('motivo')
                .setDescription('Motivo')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('tiempo_minutos')
                .setDescription('Tiempo')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('historial_detenciones')
        .setDescription('Ver historial')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('poner_advertencia')
        .setDescription('Poner advertencia')
        .addUserOption(option =>
            option.setName('miembro')
                .setDescription('Miembro')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('motivo')
                .setDescription('Motivo')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('historial_advertencias')
        .setDescription('Ver advertencias')
        .addUserOption(option =>
            option.setName('miembro')
                .setDescription('Miembro')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('registro_personal')
        .setDescription('Ver detenciones hechas por un miembro')
        .addUserOption(option =>
            option.setName('miembro')
                .setDescription('Miembro')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('historial_registro_personal')
        .setDescription('Ranking de detenciones')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('tiempo_total_capturados')
        .setDescription('Tiempo total acumulado')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('tiempo_captura_enemigo')
        .setDescription('Tiempo total de un enemigo')
        .addStringOption(option =>
            option.setName('enemigo')
                .setDescription('Nombre enemigo')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

].map(command => command.toJSON());

/* =========================
   READY
========================= */

client.once('ready', async () => {

    console.log(`✅ Bot conectado: ${client.user.tag}`);

    try {

        const rest = new REST({ version: '10' })
            .setToken(process.env.DISCORD_TOKEN);

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );

        console.log('✅ Comandos registrados');

    } catch (error) {
        console.error(error);
    }

});

/* =========================
   FUNCIONES
========================= */

function esAdmin(interaction) {

    return interaction.memberPermissions.has(
        PermissionFlagsBits.Administrator
    );

}

function canalCorrecto(interaction) {

    if (interaction.commandName === 'setup_bot') {
        return true;
    }

    return interaction.channel.name === 'comandos-bot';

}

/* =========================
   INTERACCIONES
========================= */

client.on('interactionCreate', async interaction => {

    if (!interaction.isChatInputCommand()) return;

    if (!esAdmin(interaction)) {

        return interaction.reply({
            content: '❌ Solo administradores.',
            ephemeral: true
        });

    }

    if (!canalCorrecto(interaction)) {

        return interaction.reply({
            content: '❌ Usa comandos en #comandos-bot',
            ephemeral: true
        });

    }

    const guildId = interaction.guild.id;

    /* =========================
       SETUP BOT
    ========================= */

    if (interaction.commandName === 'setup_bot') {

        const existe = interaction.guild.channels.cache.find(
            c => c.name === 'SISTEMA BOT'
        );

        if (existe) {

            return interaction.reply({
                content: '❌ Ya existe el sistema.',
                ephemeral: true
            });

        }

        const categoria = await interaction.guild.channels.create({
            name: 'SISTEMA BOT',
            type: ChannelType.GuildCategory
        });

        await interaction.guild.channels.create({
            name: 'comandos-bot',
            type: ChannelType.GuildText,
            parent: categoria.id
        });

        await interaction.guild.channels.create({
            name: 'logs-detenciones',
            type: ChannelType.GuildText,
            parent: categoria.id
        });

        await interaction.guild.channels.create({
            name: 'advertencias',
            type: ChannelType.GuildText,
            parent: categoria.id
        });

        await interaction.guild.channels.create({
            name: 'ranking',
            type: ChannelType.GuildText,
            parent: categoria.id
        });

        return interaction.reply('✅ Sistema creado correctamente.');

    }

    /* =========================
       REGISTRAR DETENCION
    ========================= */

    if (interaction.commandName === 'registrar_detencion') {

        const enemigo = interaction.options.getString('enemigo');
        const grupo = interaction.options.getString('grupo_rival');
        const motivo = interaction.options.getString('motivo');
        const tiempo = interaction.options.getInteger('tiempo_minutos');

        db.prepare(`
        INSERT INTO detenciones (
            guild_id,
            enemigo,
            grupo_rival,
            motivo,
            tiempo_minutos,
            usuario,
            fecha
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            guildId,
            enemigo,
            grupo,
            motivo,
            tiempo,
            interaction.user.tag,
            new Date().toLocaleString()
        );

        const canalLogs = interaction.guild.channels.cache.find(
            c => c.name === 'logs-detenciones'
        );

        if (canalLogs) {

            canalLogs.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('📋 Nueva Detención')
                        .addFields(
                            { name: 'Enemigo', value: enemigo },
                            { name: 'Grupo', value: grupo },
                            { name: 'Motivo', value: motivo },
                            { name: 'Tiempo', value: `${tiempo} minutos` },
                            { name: 'Registrado por', value: interaction.user.tag }
                        )
                ]
            });

        }

        return interaction.reply('✅ Detención registrada.');

    }

    /* =========================
       HISTORIAL DETENCIONES
    ========================= */

    if (interaction.commandName === 'historial_detenciones') {

        const rows = db.prepare(`
        SELECT * FROM detenciones
        WHERE guild_id = ?
        ORDER BY id DESC
        LIMIT 10
        `).all(guildId);

        if (!rows.length) {
            return interaction.reply('❌ No hay registros.');
        }

        const texto = rows.map(r =>
            `• ${r.enemigo} | ${r.grupo_rival} | ${r.tiempo_minutos} min`
        ).join('\n');

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('📋 Historial')
                    .setDescription(texto)
            ]
        });

    }

    /* =========================
       PONER ADVERTENCIA
    ========================= */

    if (interaction.commandName === 'poner_advertencia') {

        const miembro = interaction.options.getUser('miembro');
        const motivo = interaction.options.getString('motivo');

        db.prepare(`
        INSERT INTO advertencias (
            guild_id,
            miembro,
            motivo,
            admin,
            fecha
        )
        VALUES (?, ?, ?, ?, ?)
        `).run(
            guildId,
            miembro.tag,
            motivo,
            interaction.user.tag,
            new Date().toLocaleString()
        );

        return interaction.reply('⚠️ Advertencia registrada.');

    }

    /* =========================
       HISTORIAL ADVERTENCIAS
    ========================= */

    if (interaction.commandName === 'historial_advertencias') {

        const miembro = interaction.options.getUser('miembro');

        const rows = db.prepare(`
        SELECT * FROM advertencias
        WHERE guild_id = ?
        AND miembro = ?
        ORDER BY id DESC
        `).all(guildId, miembro.tag);

        if (!rows.length) {
            return interaction.reply('❌ No tiene advertencias.');
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

    /* =========================
       REGISTRO PERSONAL
    ========================= */

    if (interaction.commandName === 'registro_personal') {

        const miembro = interaction.options.getUser('miembro');

        const total = db.prepare(`
        SELECT COUNT(*) as cantidad
        FROM detenciones
        WHERE guild_id = ?
        AND usuario = ?
        `).get(guildId, miembro.tag);

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('👮 Registro Personal')
                    .addFields(
                        {
                            name: 'Miembro',
                            value: miembro.tag
                        },
                        {
                            name: 'Detenciones',
                            value: `${total.cantidad}`
                        }
                    )
            ]
        });

    }

    /* =========================
       RANKING
    ========================= */

    if (interaction.commandName === 'historial_registro_personal') {

        const rows = db.prepare(`
        SELECT usuario,
        COUNT(*) as total
        FROM detenciones
        WHERE guild_id = ?
        GROUP BY usuario
        ORDER BY total DESC
        LIMIT 10
        `).all(guildId);

        if (!rows.length) {
            return interaction.reply('❌ No hay datos.');
        }

        const texto = rows.map((r, i) =>
            `#${i + 1} ${r.usuario} — ${r.total}`
        ).join('\n');

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🏆 Ranking')
                    .setDescription(texto)
            ]
        });

    }

    /* =========================
       TIEMPO TOTAL
    ========================= */

    if (interaction.commandName === 'tiempo_total_capturados') {

        const total = db.prepare(`
        SELECT SUM(tiempo_minutos) as total
        FROM detenciones
        WHERE guild_id = ?
        `).get(guildId);

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('⏱️ Tiempo Total')
                    .setDescription(`${total.total || 0} minutos`)
            ]
        });

    }

    /* =========================
       TIEMPO ENEMIGO
    ========================= */

    if (interaction.commandName === 'tiempo_captura_enemigo') {

        const enemigo = interaction.options.getString('enemigo');

        const total = db.prepare(`
        SELECT SUM(tiempo_minutos) as total
        FROM detenciones
        WHERE guild_id = ?
        AND enemigo = ?
        `).get(guildId, enemigo);

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🎯 Tiempo Enemigo')
                    .addFields(
                        {
                            name: 'Enemigo',
                            value: enemigo
                        },
                        {
                            name: 'Tiempo',
                            value: `${total.total || 0} minutos`
                        }
                    )
            ]
        });

    }

});

/* =========================
   LOGIN
========================= */

client.login(process.env.DISCORD_TOKEN);
