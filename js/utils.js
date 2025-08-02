// Utility functions for Order It All!

// LocalStorage management
const Storage = {
    // User management
    getUserName: () => localStorage.getItem('orderItAll_userName') || '',
    setUserName: (name) => localStorage.setItem('orderItAll_userName', name),
    clearUser: () => localStorage.removeItem('orderItAll_userName'),
    
    // Trip management
    getCurrentTripId: () => localStorage.getItem('orderItAll_currentTripId'),
    setCurrentTripId: (tripId) => localStorage.setItem('orderItAll_currentTripId', tripId),
    clearCurrentTrip: () => localStorage.removeItem('orderItAll_currentTripId'),
    
    // Settings
    getSettings: () => {
        const settings = localStorage.getItem('orderItAll_settings');
        return settings ? JSON.parse(settings) : {};
    },
    setSettings: (settings) => localStorage.setItem('orderItAll_settings', JSON.stringify(settings)),
    
    // Edit timers
    getEditTimer: (orderId) => {
        const timers = JSON.parse(localStorage.getItem('orderItAll_editTimers') || '{}');
        return timers[orderId] || null;
    },
    setEditTimer: (orderId, timestamp) => {
        const timers = JSON.parse(localStorage.getItem('orderItAll_editTimers') || '{}');
        timers[orderId] = timestamp;
        localStorage.setItem('orderItAll_editTimers', JSON.stringify(timers));
    },
    clearEditTimer: (orderId) => {
        const timers = JSON.parse(localStorage.getItem('orderItAll_editTimers') || '{}');
        delete timers[orderId];
        localStorage.setItem('orderItAll_editTimers', JSON.stringify(timers));
    }
};

// Timer utilities
const Timer = {
    // Check if order is still editable (5 minutes)
    isOrderEditable: (orderId) => {
        const editTime = Storage.getEditTimer(orderId);
        if (!editTime) return false;
        
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
        return (now - editTime) < fiveMinutes;
    },
    
    // Get remaining edit time in seconds
    getRemainingEditTime: (orderId) => {
        const editTime = Storage.getEditTimer(orderId);
        if (!editTime) return 0;
        
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        const remaining = fiveMinutes - (now - editTime);
        return Math.max(0, Math.floor(remaining / 1000));
    },
    
    // Format time as MM:SS
    formatTime: (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    },
    
    // Start edit timer for an order
    startEditTimer: (orderId) => {
        Storage.setEditTimer(orderId, Date.now());
    }
};

// Toast notification system
const Toast = {
    show: (message, type = 'info', duration = 3000) => {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `alert alert-${type} mb-2`;
        toast.innerHTML = `
            <span>${message}</span>
            <button class="btn btn-sm btn-ghost" onclick="this.parentElement.remove()">×</button>
        `;
        
        container.appendChild(toast);
        
        // Auto-remove after duration
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, duration);
    },
    
    success: (message) => Toast.show(message, 'success'),
    error: (message) => Toast.show(message, 'error'),
    warning: (message) => Toast.show(message, 'warning'),
    info: (message) => Toast.show(message, 'info')
};

// Form validation utilities
const Validation = {
    // Validate quantity (positive decimal)
    isValidQuantity: (value) => {
        const num = parseFloat(value);
        return !isNaN(num) && num > 0;
    },
    
    // Validate price (non-negative decimal)
    isValidPrice: (value) => {
        const num = parseFloat(value);
        return !isNaN(num) && num >= 0;
    },
    
    // Validate required field
    isRequired: (value) => {
        return value && value.trim().length > 0;
    },
    
    // Format currency
    formatCurrency: (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount || 0);
    }
};

// DOM utilities
const DOM = {
    // Show/hide elements
    show: (selector) => {
        const element = document.querySelector(selector);
        if (element) element.classList.remove('hidden');
    },
    
    hide: (selector) => {
        const element = document.querySelector(selector);
        if (element) element.classList.add('hidden');
    },
    
    // Toggle elements
    toggle: (selector) => {
        const element = document.querySelector(selector);
        if (element) element.classList.toggle('hidden');
    },
    
    // Set text content safely
    setText: (selector, text) => {
        const element = document.querySelector(selector);
        if (element) element.textContent = text;
    },
    
    // Set inner HTML safely
    setHTML: (selector, html) => {
        const element = document.querySelector(selector);
        if (element) element.innerHTML = html;
    },
    
    // Add event listener safely
    on: (selector, event, handler) => {
        const element = document.querySelector(selector);
        if (element) element.addEventListener(event, handler);
    },
    
    // Remove event listener safely
    off: (selector, event, handler) => {
        const element = document.querySelector(selector);
        if (element) element.removeEventListener(event, handler);
    }
};

// Date/time utilities
const DateTime = {
    // Format date for display
    formatDate: (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },
    
    // Get relative time (e.g., "2 hours ago")
    getRelativeTime: (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        return 'Just now';
    },
    
    // Check if date is today
    isToday: (dateString) => {
        const date = new Date(dateString);
        const today = new Date();
        return date.toDateString() === today.toDateString();
    }
};

// String utilities
const StringUtils = {
    // Capitalize first letter
    capitalize: (str) => {
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    },
    
    // Truncate text with ellipsis
    truncate: (str, length = 50) => {
        if (str.length <= length) return str;
        return str.substring(0, length) + '...';
    },
    
    // Generate initials from name
    getInitials: (name) => {
        return name
            .split(' ')
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2);
    },
    
    // Sanitize input
    sanitize: (str) => {
        return str.replace(/[<>]/g, '');
    }
};

// Array utilities
const ArrayUtils = {
    // Group array by key
    groupBy: (array, key) => {
        return array.reduce((groups, item) => {
            const group = item[key];
            groups[group] = groups[group] || [];
            groups[group].push(item);
            return groups;
        }, {});
    },
    
    // Sort array by multiple keys
    sortBy: (array, ...keys) => {
        return array.sort((a, b) => {
            for (let key of keys) {
                if (a[key] < b[key]) return -1;
                if (a[key] > b[key]) return 1;
            }
            return 0;
        });
    },
    
    // Remove duplicates
    unique: (array) => {
        return [...new Set(array)];
    }
};

// Export utilities for use in other modules
window.Utils = {
    Storage,
    Timer,
    Toast,
    Validation,
    DOM,
    DateTime,
    StringUtils,
    ArrayUtils
}; 