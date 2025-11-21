// Admin Dashboard API Integration
const API_BASE_URL = 'http://localhost:4007';
let socket = null;
let currentChatUserId = null;

// Initialize Socket.IO
function initializeChat() {
  if (socket && socket.connected) return socket;
  
  socket = io(API_BASE_URL);
  
  socket.on('connect', () => {
    console.log('Connected to chat server');
    socket.emit('admin-join', { admin: true });
  });
  
  socket.on('new-message', (data) => {
    if (data.userId === currentChatUserId || data.sender === 'user') {
      displayMessage(data);
    }
  });
  
  socket.on('message-sent', (data) => {
    console.log('Message sent successfully');
  });
  
  socket.on('message-error', (data) => {
    showNotification('Error sending message: ' + data.error, 'error');
  });
  
  return socket;
}

// Load dashboard statistics
async function loadStats() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/stats`);
    if (!response.ok) throw new Error('Failed to fetch stats');
    
    const stats = await response.json();
    document.getElementById('totalUsers').textContent = stats.totalUsers || '0';
    document.getElementById('activeCampaigns').textContent = stats.activeCampaigns || '0';
    document.getElementById('pendingApprovals').textContent = stats.pendingApprovals || '0';
    document.getElementById('totalDonations').textContent = stats.totalDonations || '$0.00';
  } catch (error) {
    console.error('Error loading stats:', error);
    showNotification('Failed to load dashboard statistics', 'error');
  }
}

// Load users
async function loadUsers(search = '', role = '') {
  try {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (role) params.append('role', role);
    params.append('limit', '100');
    
    const response = await fetch(`${API_BASE_URL}/api/admin/users?${params}`);
    if (!response.ok) throw new Error('Failed to fetch users');
    
    const data = await response.json();
    displayUsers(data.rows || data);
    populateUserSelects(data.rows || data);
  } catch (error) {
    console.error('Error fetching users:', error);
    showNotification('Failed to load users', 'error');
  }
}

// Display users in table
function displayUsers(users) {
  const tbody = document.getElementById('usersTable');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  if (!users || users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No users found</td></tr>';
    return;
  }
  
  users.forEach(user => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${user.id}</td>
      <td>${escapeHtml(user.name || user.email)}</td>
      <td>${escapeHtml(user.email)}</td>
      <td><span class="badge badge-${user.role}">${user.role || 'user'}</span></td>
      <td><span class="badge badge-${user.status || 'active'}">${user.status || 'active'}</span></td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="openEditUserModal(${user.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id})">Delete</button>
        <button class="btn btn-sm btn-info" onclick="openChatWithUser(${user.id}, '${escapeHtml(user.name || user.email)}')">Chat</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Populate user dropdowns
function populateUserSelects(users) {
  const selects = ['balanceUserId', 'deductUserId'];
  selects.forEach(selectId => {
    const select = document.getElementById(selectId);
    if (select) {
      select.innerHTML = '<option value="">-- Select User --</option>';
      users.forEach(user => {
        select.innerHTML += `<option value="${user.id}">${escapeHtml(user.name || user.email)} (${user.email})</option>`;
      });
    }
  });
}

// Add balance
async function handleAddBalance(event) {
  event.preventDefault();
  
  const userId = document.getElementById('balanceUserId').value;
  const amount = parseFloat(document.getElementById('balanceAmount').value);
  const reason = document.getElementById('balanceReason').value;
  
  if (!userId || !amount || amount <= 0) {
    showNotification('Please enter valid user and amount', 'error');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/balance/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, amount, reason })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add balance');
    }
    
    showNotification('Balance added successfully!', 'success');
    closeAddBalanceModal();
    document.getElementById('addBalanceForm').reset();
  } catch (error) {
    console.error('Error adding balance:', error);
    showNotification('Error: ' + error.message, 'error');
  }
}

// Deduct balance
async function handleDeductBalance(event) {
  event.preventDefault();
  
  const userId = document.getElementById('deductUserId').value;
  const amount = parseFloat(document.getElementById('deductAmount').value);
  const reason = document.getElementById('deductReason').value;
  
  if (!userId || !amount || amount <= 0) {
    showNotification('Please enter valid user and amount', 'error');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/balance/deduct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, amount, reason })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to deduct balance');
    }
    
    showNotification('Balance deducted successfully!', 'success');
    event.target.reset();
  } catch (error) {
    console.error('Error deducting balance:', error);
    showNotification('Error: ' + error.message, 'error');
  }
}

// Load chat with user
async function openChatWithUser(userId, userName) {
  currentChatUserId = userId;
  
  // Update chat header
  document.getElementById('currentChatUser').textContent = userName;
  
  // Switch to chat section
  showSection('chat');
  
  try {
    // Leave previous chat room
    if (socket && socket.connected) {
      socket.emit('leave-user-chat', { userId: currentChatUserId });
    }
    
    // Join new chat room
    initializeChat();
    socket.emit('join-user-chat', { userId });
    
    // Load message history
    const response = await fetch(`${API_BASE_URL}/api/admin/chat/${userId}/messages`);
    if (!response.ok) throw new Error('Failed to fetch messages');
    
    const data = await response.json();
    displayMessages(data.messages || []);
  } catch (error) {
    console.error('Error loading chat:', error);
    displayMessages([]);
  }
}

// Display chat messages
function displayMessages(messages) {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (!messages || messages.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No messages yet</p>';
    return;
  }
  
  messages.forEach(msg => {
    displayMessage(msg);
  });
}

function displayMessage(msg) {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${msg.sender}`;
  
  const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : new Date().toLocaleString();
  
  messageDiv.innerHTML = `
    <div class="message-content">${escapeHtml(msg.message)}</div>
    <div class="message-timestamp">${timestamp}</div>
  `;
  
  container.appendChild(messageDiv);
  container.scrollTop = container.scrollHeight;
}

// Send message
async function sendMessage() {
  const input = document.getElementById('messageInput');
  if (!input) return;
  
  const message = input.value.trim();
  
  if (!message || !currentChatUserId) return;
  
  try {
    // Send via Socket.IO for real-time
    if (socket && socket.connected) {
      socket.emit('send-admin-message', {
        userId: currentChatUserId,
        message: message
      });
      
      // Display message immediately
      displayMessage({
        sender: 'admin',
        message: message,
        timestamp: new Date().toISOString()
      });
    } else {
      // Fallback to REST API
      const response = await fetch(`${API_BASE_URL}/api/admin/chat/${currentChatUserId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      
      if (!response.ok) throw new Error('Failed to send message');
      
      displayMessage({
        sender: 'admin',
        message: message,
        timestamp: new Date().toISOString()
      });
    }
    
    input.value = '';
  } catch (error) {
    console.error('Error sending message:', error);
    showNotification('Failed to send message', 'error');
  }
}

// Handle chat keypress
function handleChatKeypress(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

// Delete user
async function deleteUser(userId) {
  if (!confirm('Are you sure you want to delete this user?')) return;
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) throw new Error('Failed to delete user');
    
    showNotification('User deleted successfully', 'success');
    loadUsers();
  } catch (error) {
    console.error('Error deleting user:', error);
    showNotification('Failed to delete user', 'error');
  }
}

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showNotification(message, type = 'info') {
  // Simple alert for now - can be replaced with toast notifications
  alert(message);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initDashboard();
  initializeChat();
  
  // Setup search with debounce
  let searchTimeout;
  const searchInput = document.getElementById('userSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const search = e.target.value;
      const role = document.getElementById('roleFilter')?.value || '';
      searchTimeout = setTimeout(() => {
        loadUsers(search, role);
      }, 300);
    });
  }
  
  // Setup role filter
  const roleFilter = document.getElementById('roleFilter');
  if (roleFilter) {
    roleFilter.addEventListener('change', (e) => {
      const role = e.target.value;
      const search = document.getElementById('userSearch')?.value || '';
      loadUsers(search, role);
    });
  }
  
  // Setup forms
  const addBalanceForm = document.getElementById('addBalanceForm');
  if (addBalanceForm) {
    addBalanceForm.addEventListener('submit', handleAddBalance);
  }
  
  const deductBalanceForm = document.getElementById('deductBalanceForm');
  if (deductBalanceForm) {
    deductBalanceForm.addEventListener('submit', handleDeductBalance);
  }
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  if (socket && socket.connected) {
    socket.disconnect();
  }
});
