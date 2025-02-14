const { Client, GatewayIntentBits, Events, REST, Routes, ApplicationCommandData } = require('discord.js');
require('dotenv').config();

// Create a new client instance with all required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// Game sessions storage
const shiritoriSessions = new Map();

class ShiritoriSession {
  constructor(channelId) {
    this.channelId = channelId;
    this.wordChain = [];
    this.usedWords = new Set();
  }

  normalizeWord(word) {
    return word.trim().toLowerCase();
  }

  isValidMove(word) {
    const normalizedWord = this.normalizeWord(word);

    // First word is always valid
    if (this.wordChain.length === 0) {
      return true;
    }

    const lastWord = this.normalizeWord(this.wordChain[this.wordChain.length - 1]);
    const lastChar = lastWord.charAt(lastWord.length - 1);
    const firstChar = normalizedWord.charAt(0);

    // Check if word starts with last character of previous word
    if (firstChar !== lastChar) {
      return false;
    }

    // Check if word has been used before
    if (this.usedWords.has(normalizedWord)) {
      return false;
    }

    // Check if word ends with 'ん'
    if (normalizedWord.endsWith('ん')) {
      return false;
    }

    return true;
  }

  addWord(word) {
    const normalizedWord = this.normalizeWord(word);
    this.wordChain.push(word);
    this.usedWords.add(normalizedWord);
  }
}

// Command registration
const commands = [
  {
    name: 'しりとり開始',
    description: 'しりとりゲームを開始します'
  },
  {
    name: 'しりとりリセット',
    description: 'しりとりゲームをリセットします'
  }
];

// Error handling and reconnection logic
client.on('error', error => {
  console.error('Discord client error:', error);
  client.destroy();
  client.login(process.env.DISCORD_TOKEN);
});

client.on('disconnect', () => {
  console.log('Bot disconnected! Attempting to reconnect...');
  client.login(process.env.DISCORD_TOKEN);
});

// When the client is ready, register commands and log
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('Successfully registered application commands.');
  } catch (error) {
    console.error('Error registering application commands:', error);
  }
});

// Handle slash commands
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, channelId } = interaction;

  if (commandName === 'しりとり開始') {
    if (shiritoriSessions.has(channelId)) {
      await interaction.reply('このチャンネルでは既にしりとりゲームが進行中です。');
      return;
    }
    
    shiritoriSessions.set(channelId, new ShiritoriSession(channelId));
    await interaction.reply('しりとりゲームを開始しました！最初の単語を入力してください。');
  }

  if (commandName === 'しりとりリセット') {
    if (!shiritoriSessions.has(channelId)) {
      await interaction.reply('このチャンネルではしりとりゲームは進行していません。');
      return;
    }

    shiritoriSessions.delete(channelId);
    await interaction.reply('しりとりゲームをリセットしました。');
  }
});

// Handle messages for the game
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;

  const session = shiritoriSessions.get(message.channelId);
  if (!session) return;

  const word = message.content.trim();
  if (!word) return;

  if (!session.isValidMove(word)) {
    const lastWord = session.wordChain[session.wordChain.length - 1];
    await message.react('❌');
    await message.reply(`間違いです！前の単語「${lastWord}」の最後の文字から始める必要があります。`);
    return;
  }

  if (word.endsWith('ん')) {
    await message.react('❌');
    await message.reply('「ん」で終わる単語が入力されました。あなたの負けです！ゲーム終了します。');
    shiritoriSessions.delete(message.channelId);
    return;
  }

  session.addWord(word);
  await message.react('✅');
});

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  client.destroy();
  process.exit(0);
});

// Login to Discord with error handling
client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error('Failed to login:', error);
  process.exit(1);
});