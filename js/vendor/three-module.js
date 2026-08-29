// Bridge: expose the globally-loaded THREE (from classic <script>) as an ES module export.
const T = self.THREE;
if (!T) throw new Error('THREE 未加载：请确保在模块脚本之前加载 js/vendor/three.min.js');
export default T;
