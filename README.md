# Personal Navigation Website

A modern personal navigation website built on Cloudflare Worker, featuring category management, custom backgrounds, permission control, and more.

🌐 **Live Demo**: [https://begin.209801.xyz/](https://begin.209801.xyz/)

## ✨ Key Features

- 🎨 **Stunning Starry Background** - Built-in dynamic stellar effects with custom background image support
- 🔐 **Multi-tier Permission System** - Three access levels: public access, guest login, and admin privileges
- 📱 **Responsive Design** - Perfect support for mobile, tablet, and desktop devices
- 🎯 **Drag & Drop Sorting** - Intuitive drag operations for easy category and link reordering
- 🔍 **Integrated Search** - Built-in Google and Baidu search boxes
- 🌟 **Modern Interface** - Glassmorphism design with smooth animations

## 🚀 Deployment Guide

### 1. Set Environment Variables

Configure the following in your Cloudflare Worker environment variables:

```env
# Admin accounts (multiple allowed, format: username:password)
ADMIN1=admin:your_password_here
ADMIN2=admin2:another_password

# Guest accounts (multiple allowed, for accessing private categories)
USER1=guest:guest_password
USER2=visitor:visitor_password
```

### 2. Configure KV Storage

1. Create a KV namespace in the Cloudflare console
2. Bind the KV in Worker settings with variable name `KV`

### 3. Deploy Code

Deploy the provided JavaScript code to your Cloudflare Worker.

## 👥 User Permissions

### Public Access

- View all non-private categories and links
- Use search functionality
- No access to management features

### Guest Access

- View all categories (including private ones)
- Login via "Guest Login" button using USER environment credentials

### Admin Access

- Full management privileges
- Login via "Admin" button using ADMIN environment credentials
- Access to all configuration and management operations

## ⚙️ Basic Configuration

### Website Settings

1. Login as administrator
2. Click the "Admin" button in the bottom right corner
3. In the admin panel's "Site Settings" section:
   - **Site Title**: Modify the main page title
   - **Site Subtitle**: Modify the description text below the title
4. Click "Save Site Settings"

### Background Image Management

#### Upload Background Images

1. Find the "Background Management" section in the admin panel
2. Click the upload area or drag image files to the dashed box
3. The system will automatically set it as the current background

#### Image Requirements

- **Supported Formats**: JPG, PNG, GIF, WebP, and other common image formats
- **File Size**: Maximum 5MB per file
- **Recommended Resolution**: 1920x1080 or higher
- **Recommended Aspect Ratio**: 16:9 landscape for best results

#### Background Management Tips

- Upload multiple background images; the system will randomly select one to display
- Click the "×" in the top-right corner of thumbnails to delete corresponding backgrounds
- Use "Reset Background" to remove all custom backgrounds and return to the stellar effect

## 📂 Category and Link Management

### Add New Category

1. In the admin panel's "Category Management" section
2. Click the "Add New Category" button
3. Enter the category name
4. Click the edit button on the right side of the category for detailed configuration

### Category Configuration Options

#### Basic Information

- **Category Name**: The category title displayed on the page
- **Icon**: Use Font Awesome icon names (see Icon Settings section)
- **Set as Private**: Check to make visible only to logged-in users

#### Link Management

- **Main Category Links**: Displayed directly under the category title
- **Subcategories**: Create subcategories for better link organization

### Add Links

When editing a category, you can add links:

1. Click the "Add Link" button
2. Fill in link information:
   - **Name**: Display name of the link
   - **URL**: Complete web address (including http:// or https://)
   - **Icon**: Font Awesome icon class name
   - **Description**: Tooltip text shown on hover

### Subcategory Usage

Perfect for further organizing related links:

1. Click "Add Subcategory" when editing a category
2. Enter the subcategory name
3. Can individually set subcategories as private
4. Add dedicated links to subcategories

## 🎨 Icon Settings Guide

This website uses the [Font Awesome 6.4.0](https://fontawesome.com/icons) icon library.

### Icon Format

Icon class names follow the format: `style-prefix icon-name`

#### Common Style Prefixes

- `fas` - Solid icons
- `far` - Regular (outline) icons
- `fab` - Brand icons

### Category Icon Examples

For category configuration, only enter the icon name (without prefix):

```
globe - Globe icon
robot - Robot icon  
tools - Tools icon
lock - Lock icon
heart - Heart icon
star - Star icon
bookmark - Bookmark icon
```

### Link Icon Examples

For link configuration, enter the complete class name:

```
fab fa-google - Google icon
fab fa-github - GitHub icon
fab fa-youtube - YouTube icon
fas fa-search - Search icon
fas fa-external-link-alt - External link icon
fas fa-home - Home icon
fas fa-envelope - Email icon
fas fa-phone - Phone icon
```

### Finding Icons

1. Visit the [Font Awesome icon library](https://fontawesome.com/icons)
2. Search for your desired icon keywords
3. Click the icon to view its specific class name
4. Copy the complete class name to your configuration

### Icon Colors

Icon colors automatically adapt to the website theme without manual configuration. Special glow effects appear on hover.

## 🎯 Drag & Drop Sorting

### Category Sorting

1. In the admin panel's category management area
2. Hold the drag handle (≡ icon) on the left side of categories
3. Drag up or down to the target position
4. Release mouse to auto-save

### Link Sorting

1. In the category editing modal
2. Hold the drag handle on the left side of links
3. Drag to target position
4. Click "Save Changes"

## 🔍 Search Functionality

The page includes two built-in search boxes:

- **Google Search**: Uses Google search engine
- **Baidu Search**: Uses Baidu search engine

Search results open in new tabs without affecting current page browsing.

## 📱 Mobile Optimization

The website fully supports mobile devices:

- **Adaptive Layout**: Automatically adjusts based on screen size
- **Touch-Friendly**: Optimized button sizes and spacing
- **Gesture Support**: Touch drag & drop sorting
- **Performance Optimized**: Animation effects optimized for mobile devices

## ⚠️ Important Notes

### Data Storage

- All configuration data is stored in Cloudflare KV
- KV storage has certain read/write limits; frequent operations may be restricted
- Recommend completing bulk configurations at once to avoid frequent saves

### Image Storage

- Background images are stored in KV as Base64 format
- Single KV record maximum is 25MB; recommend controlling total image count
- Large images will affect page loading speed

### Security

- Use strong passwords for admin accounts
- Regularly change guest account passwords
- Avoid special characters in environment variables

### Browser Compatibility

- Supports modern browsers (Chrome, Firefox, Safari, Edge)
- Internet Explorer not supported
- Recommend using latest browser versions for best experience

## 🔧 Troubleshooting

### Common Issues

#### Cannot Login to Admin Panel

1. Check if ADMIN environment variable configuration is correct
2. Confirm username and password format is `username:password`
3. Check for special characters that might interfere

#### Background Images Not Displaying

1. Check if image format is supported
2. Confirm file size doesn't exceed 5MB
3. Try refreshing the page or clearing browser cache

#### KV Storage Issues

1. Confirm KV namespace is properly bound
2. Check if Worker has KV access permissions
3. Review Worker logs for specific error information

#### Drag & Drop Not Working

1. Confirm browser supports Drag API
2. Check if on mobile device (mobile uses touch drag)
3. Try refreshing the page to reload scripts

### Performance Optimization Tips

1. **Image Optimization**: Compress background images to reduce loading time
2. **Category Organization**: Avoid too many links in single category; use subcategories
3. **Regular Cleanup**: Delete unused background images and links
4. **Cache Utilization**: Set appropriate Cloudflare cache rules

## 🌟 Demo Features

Visit our [live demo](https://begin.209801.xyz/) to explore:

- Interactive starry background with smooth animations
- Sample categories with popular websites and tools
- Mobile-responsive design demonstration
- Search functionality testing
- Guest login experience (contact for demo credentials)

## 📄 License

This project is open source under the MIT License. You are free to use, modify, and distribute it.

## 🤝 Contributing

Issues and Pull Requests are welcome to improve this project!

## 🌐 Language Versions

- [中文版 README](README_CN.md)
- [English README](README.md)

---

*For additional questions, please refer to the Cloudflare Worker official documentation or create an Issue for discussion.*