/**
 * There has got to be a better way... what am I missing?
 */
const fs = require('fs');

require('../../node_modules/raw-body/node_modules/iconv-lite/encodings');
require('../../node_modules/negotiator/lib/mediaType');
require('../../node_modules/iconv-lite/encodings');
require('ejs');

module.exports = function(mock) {
  return function(mocks) {
    mock({
      ...mocks,
      'public/images/bpe-logo.png': fs.readFileSync('public/images/bpe-logo.png'),
      'public/scripts/camera.js': fs.readFileSync('public/scripts/camera.js'),
      'public/scripts/like.js': fs.readFileSync('public/scripts/like.js'),
      'public/scripts/upload.js': fs.readFileSync('public/scripts/upload.js'),
      'public/stylesheets/style.css': fs.readFileSync('public/stylesheets/style.css'),
      'public/stylesheets/fontawesome-free-5.9.0-web/css/all.css': fs.readFileSync('public/stylesheets/fontawesome-free-5.9.0-web/css/all.css'),
      'spec/files/bus.mjpeg': fs.readFileSync('spec/files/bus.mjpeg'),
      'spec/files/troll.jpg': fs.readFileSync('spec/files/troll.jpg'),
      'spec/files/troll.png': fs.readFileSync('spec/files/troll.png'),
      'views/index.ejs': fs.readFileSync('views/index.ejs'),
      'views/_partials/appLink.ejs': fs.readFileSync('views/_partials/appLink.ejs'),
      'views/_partials/head.ejs': fs.readFileSync('views/_partials/head.ejs'),
      'views/_partials/navbar.ejs': fs.readFileSync('views/_partials/navbar.ejs'),
      'views/_partials/messages.ejs': fs.readFileSync('views/_partials/messages.ejs'),
      'views/_partials/login.ejs': fs.readFileSync('views/_partials/login.ejs'),
      'views/_partials/footer.ejs': fs.readFileSync('views/_partials/footer.ejs'),
      'views/_partials/pager.ejs': fs.readFileSync('views/_partials/pager.ejs'),
      'views/agent/index.ejs': fs.readFileSync('views/agent/index.ejs'),
      'views/image/_controls.ejs': fs.readFileSync('views/image/_controls.ejs'),
      'views/image/flagged.ejs': fs.readFileSync('views/image/flagged.ejs'),
      'views/image/index.ejs': fs.readFileSync('views/image/index.ejs'),
      'views/image/show.ejs': fs.readFileSync('views/image/show.ejs'),
      'views/image/_feedbackControls.ejs': fs.readFileSync('views/image/_feedbackControls.ejs'),
      'views/image/_noteControls.ejs': fs.readFileSync('views/image/_noteControls.ejs'),
      'views/image/_header.ejs': fs.readFileSync('views/image/_header.ejs'),
      'views/image/_pager.ejs': fs.readFileSync('views/image/_pager.ejs'),
      'views/error.ejs': fs.readFileSync('views/error.ejs'),
      'views/reset.ejs': fs.readFileSync('views/reset.ejs'),
    });
  };
};
