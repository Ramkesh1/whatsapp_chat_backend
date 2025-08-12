const  getCurrentDateTime =()=> {
    const now = new Date();

    // Format date as yyyy-mm-dd
    const date = now.toISOString().split('T')[0];

    // Format time as hh:mm:ss
    const time = now.toTimeString().split(' ')[0];

    return { date, time };
}


const addDaysToDate = (dateString, daysToAdd) => {
    const date = new Date(dateString); // Convert string to Date object
    date.setDate(date.getDate() + daysToAdd); // Add days
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0"); // Ensure 2-digit month
    const day = String(date.getDate()).padStart(2, "0"); // Ensure 2-digit day
    return `${year}-${month}-${day}`; // Return in yyyy-mm-dd format
  };
  



module.exports={getCurrentDateTime,addDaysToDate}