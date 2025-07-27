# Aven Support Agent

## Overview
The Aven Support Agent is a React-based customer support application designed to assist users with their inquiries. It features a chat interface where users can interact with an AI-powered support agent, which provides responses based on user input.

## Project Structure
```
aven-support-agent
├── public
│   └── index.html          # Main HTML file serving as the entry point for the React application
├── src
│   ├── App.jsx             # Main App component managing chat functionality
│   ├── index.js            # Entry point for the React application
│   └── styles
│       └── tailwind.css    # Tailwind CSS styles for the project
├── package.json            # Configuration file for npm
├── tailwind.config.js      # Configuration file for Tailwind CSS
├── postcss.config.js       # Configuration file for PostCSS
└── README.md               # Documentation for the project
```

## Setup Instructions

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd aven-support-agent
   ```

2. **Install Dependencies**
   Make sure you have Node.js and npm installed. Then run:
   ```bash
   npm install
   ```

3. **Run the Application**
   Start the development server:
   ```bash
   npm start
   ```
   The application will be available at `http://localhost:3000`.

## Usage
- Open the application in your web browser.
- Type your questions in the input field and press Enter or click the Send button to interact with the AI support agent.
- You can also toggle voice chat functionality (conceptual, requires integration).

## Customization
- Modify the styles in `src/styles/tailwind.css` to customize the appearance of the application.
- Update the AI responses in `src/App.jsx` to tailor the support agent's replies to your needs.

## Contributing
Contributions are welcome! Please submit a pull request or open an issue for any enhancements or bug fixes.

## License
This project is licensed under the MIT License. See the LICENSE file for details.