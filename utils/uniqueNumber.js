
const generateUniqueId = () => {
    // Generate random alphanumeric characters
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) { // Generate 6 random characters
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  
    // Get current date-time in milliseconds to ensure uniqueness
    const dateTime = Date.now().toString().slice(-4); // Get last 4 digits from timestamp
  
    // Combine random characters and datetime
    return result + dateTime; // Total length will be 10 characters
  };


  



  module.exports = generateUniqueId;