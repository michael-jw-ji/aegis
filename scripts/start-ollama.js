// Script to check if Ollama is running and start it if not (using Windows service when possible)
import { exec } from 'child_process';
import { promisify } from 'util';
import http from 'http';

const execAsync = promisify(exec);

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_CHECK_TIMEOUT = 3000; // 3 seconds

// Check if Ollama is already running
async function checkOllama() {
  return new Promise((resolve) => {
    const req = http.get(`${OLLAMA_URL}/api/tags`, { timeout: OLLAMA_CHECK_TIMEOUT }, (res) => {
      resolve(res.statusCode === 200);
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Start Ollama in a hidden window (Windows only)
async function startOllamaHidden() {
  const platform = process.platform;
  
  if (platform !== 'win32') {
    // Linux/Mac: just check if running, don't auto-start
    console.log('💡 On Linux/Mac, please start Ollama manually: ollama serve');
    return false;
  }

  console.log('🦙 Attempting to start Ollama in hidden window...');
  
  try {
    // Method 1: Try PowerShell to start in hidden window (no CMD window)
    const psCommand = 'powershell -WindowStyle Hidden -Command "Start-Process -FilePath \'ollama\' -ArgumentList \'serve\' -WindowStyle Hidden"';
    
    try {
      await execAsync(psCommand, { timeout: 5000 });
      console.log('✅ Started Ollama process (hidden)');
      return true;
    } catch (psError) {
      // If PowerShell fails, try direct spawn with hidden window
      console.log('Trying alternative method...');
      
      const { spawn } = await import('child_process');
      
      // Use PowerShell to launch in hidden mode
      const psProcess = spawn('powershell', [
        '-WindowStyle', 'Hidden',
        '-Command',
        'Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden'
      ], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      
      psProcess.unref();
      console.log('✅ Started Ollama process (hidden)');
      return true;
    }
  } catch (error) {
    console.log('⚠️  Could not start Ollama automatically');
    console.log('💡 Make sure Ollama is installed and in your PATH');
    console.log('💡 You may need to start it manually: ollama serve');
    return false;
  }
}

// Main function - check and start if needed
async function main() {
  console.log('🔍 Checking if Ollama is running...');
  let isRunning = await checkOllama();
  
  if (isRunning) {
    console.log('✅ Ollama is already running');
  } else {
    console.log('❌ Ollama is not running');
    
    if (process.platform === 'win32') {
      // Try to start Ollama in hidden window (no visible CMD)
      const started = await startOllamaHidden();
      
      if (started) {
        // Wait a moment for Ollama to start
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Re-check if it's now running
        isRunning = await checkOllama();
        if (isRunning) {
          console.log('✅ Ollama started successfully');
        } else {
          console.log('⚠️  Ollama process started but not responding yet');
          console.log('💡 Give it a few more seconds, or check Ollama manually');
        }
      }
    } else {
      console.log('💡 Please start Ollama manually: ollama serve');
    }
  }
  
  // Keep script running to show status in concurrently
  // Poll every 30 seconds to check if Ollama is still running
  setInterval(async () => {
    const stillRunning = await checkOllama();
    if (!stillRunning) {
      console.log('⚠️  Ollama appears to have stopped');
    }
  }, 30000);
}

main().catch((error) => {
  console.error('Error:', error);
  // Don't exit - let concurrently continue
});

