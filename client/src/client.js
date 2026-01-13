/**
 * A2A AgenticDirect Client
 * JavaScript client using @a2a-js/sdk
 */

import { Agent } from '@a2a-js/sdk';

// Global state
let agent = null;
let currentTask = null;
let taskPollInterval = null;
let tasks = new Map();

/**
 * Connect to agent
 */
window.connectAgent = async function() {
  const serverUrl = document.getElementById('serverUrl').value;
  const agentRole = document.getElementById('agentRole').value;
  const statusEl = document.getElementById('connectionStatus');
  const errorDisplay = document.getElementById('errorDisplay');

  try {
    statusEl.innerHTML = '<span class="status working">Connecting...</span>';
    errorDisplay.innerHTML = '';

    // Construct agent card URL
    const agentCardUrl = `${serverUrl}/a2a/${agentRole}/.well-known/agent-card.json`;

    console.log('🔗 Connecting to agent:', agentCardUrl);

    // Fetch agent card first to verify connection
    const response = await fetch(agentCardUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch agent card: ${response.statusText}`);
    }

    const agentCard = await response.json();
    console.log('📋 Agent card received:', agentCard);

    // Display agent card
    document.getElementById('agentCardDisplay').textContent = JSON.stringify(agentCard, null, 2);
    document.getElementById('agentCardSection').style.display = 'block';

    // Create Agent instance
    agent = new Agent(agentCardUrl);

    // Show connection status
    statusEl.innerHTML = '<span class="status connected">Connected</span>';
    document.getElementById('chatSection').style.display = 'block';

    console.log('✅ Connected to agent');

  } catch (error) {
    console.error('❌ Connection failed:', error);
    statusEl.innerHTML = '<span class="status disconnected">Connection Failed</span>';
    errorDisplay.innerHTML = `<div class="error">Connection Error: ${error.message}</div>`;
  }
};

/**
 * Send message to agent
 */
window.sendMessage = async function() {
  const messageInput = document.getElementById('messageInput');
  const messageText = messageInput.value.trim();

  if (!messageText) return;
  if (!agent) {
    alert('Please connect to an agent first');
    return;
  }

  try {
    // Clear input
    messageInput.value = '';

    // Display user message
    addMessage('user', messageText);

    console.log('📤 Sending message:', messageText);

    // Send message using A2A SDK
    const task = await agent.sendMessage({
      role: 'user',
      parts: [{ kind: 'text', text: messageText }]
    });

    console.log('📨 Task created:', task);

    // Store task
    tasks.set(task.id, task);
    currentTask = task;

    // Display working status
    addMessage('agent', 'Working on your request...', null, 'working');

    // Poll for task updates
    startTaskPolling(task.id);

  } catch (error) {
    console.error('❌ Failed to send message:', error);
    addMessage('agent', `Error: ${error.message}`, null, 'error');
  }
};

/**
 * Start polling for task updates
 */
function startTaskPolling(taskId) {
  if (taskPollInterval) {
    clearInterval(taskPollInterval);
  }

  let shownAgentMessages = 0;
  const existingTask = tasks.get(taskId);
  if (existingTask?.history) {
    shownAgentMessages = existingTask.history.filter(h => h.role === 'agent').length;
  }

  taskPollInterval = setInterval(async () => {
    try {
      if (!currentTask) return;

      const task = await agent.getTask(taskId);
      console.log('🔄 Task status:', task.status.state);

      // Update task in map
      tasks.set(taskId, task);

      // Check for new agent messages
      const agentMessages = task.history.filter(h => h.role === 'agent');

      if (agentMessages.length > shownAgentMessages) {
        const newMessages = agentMessages.slice(shownAgentMessages);
        console.log(`💬 Found ${newMessages.length} new agent messages`);

        // Remove working message
        const chatMessages = document.getElementById('chatMessages');
        const workingMsg = chatMessages.querySelector('.message.working');
        if (workingMsg) {
          workingMsg.remove();
        }

        // Display new messages
        newMessages.forEach(msg => {
          displayAgentMessage(msg);
        });

        shownAgentMessages = agentMessages.length;
      }

      // Check if task completed or failed
      if (task.status.state === 'completed') {
        clearInterval(taskPollInterval);
        taskPollInterval = null;
        currentTask = null;
        console.log('✅ Task completed');

      } else if (task.status.state === 'failed') {
        clearInterval(taskPollInterval);
        taskPollInterval = null;

        // Remove working message
        const chatMessages = document.getElementById('chatMessages');
        const workingMsg = chatMessages.querySelector('.message.working');
        if (workingMsg) {
          workingMsg.remove();
        }

        addMessage('agent', `Task failed: ${task.status.message || 'Unknown error'}`, null, 'error');
        currentTask = null;
        console.log('❌ Task failed');
      }

    } catch (error) {
      console.error('❌ Failed to poll task:', error);
      clearInterval(taskPollInterval);
      taskPollInterval = null;
    }
  }, 1000); // Poll every second
}

/**
 * Display agent message from task history
 */
function displayAgentMessage(message) {
  const textParts = message.parts.filter(p => p.kind === 'text');
  const dataParts = message.parts.filter(p => p.kind === 'data');

  const text = textParts.map(p => p.text).join('\n');
  const data = dataParts.length > 0 ? dataParts[0].data : null;

  addMessage('agent', text, data);
}

/**
 * Add message to chat
 */
function addMessage(role, text, data = null, className = '') {
  const chatMessages = document.getElementById('chatMessages');

  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role} ${className}`;

  messageDiv.innerHTML = `
    <div class="role">${role}</div>
    <div class="content">${escapeHtml(text)}</div>
    ${data ? `<div class="data">${escapeHtml(JSON.stringify(data, null, 2))}</div>` : ''}
  `;

  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Handle Enter key in message input
 */
window.handleKeyPress = function(event) {
  if (event.key === 'Enter') {
    sendMessage();
  }
};

/**
 * Quick message shortcut
 */
window.quickMessage = function(text) {
  document.getElementById('messageInput').value = text;
  sendMessage();
};

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Auto-connect on load if server URL is set
window.addEventListener('load', () => {
  console.log('🚀 A2A AgenticDirect Client loaded');
});
