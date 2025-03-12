const fs = require('fs');
const path = require('path');

// List of files to update
const filesToUpdate = [
  'src/pages/OtherPage/NotFound.tsx',
  'src/pages/AuthPages/AuthPageLayout.tsx',
  'src/layout/AppHeader.tsx',
  'src/hooks/useGoBack.ts',
  'src/components/ui/dropdown/DropdownItem.tsx',
  'src/components/ui/alert/Alert.tsx',
  'src/components/header/UserDropdown.tsx',
  'src/components/header/NotificationDropdown.tsx',
  'src/components/header/Header.tsx',
  'src/components/common/ScrollToTop.tsx',
  'src/components/common/PageBreadCrumb.tsx',
  'src/components/auth/SignUpForm.tsx',
  'src/components/auth/SignInForm.tsx'
];

// Process each file
filesToUpdate.forEach(filePath => {
  const fullPath = path.join(__dirname, filePath);
  
  try {
    // Read the file
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Replace the import
    content = content.replace(/from "react-router"/g, 'from "react-router-dom"');
    
    // Write the updated content back to the file
    fs.writeFileSync(fullPath, content, 'utf8');
    
    console.log(`Updated: ${filePath}`);
  } catch (error) {
    console.error(`Error updating ${filePath}:`, error.message);
  }
});

console.log('All imports updated successfully!'); 