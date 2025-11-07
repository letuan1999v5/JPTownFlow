// app/(tabs)/guides.tsx
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

// Dữ liệu giả lập (Sau này sẽ thay bằng Firebase)
const MOCK_BLOGS = [
  { id: 1, title: 'Hướng dẫn đăng ký Thẻ My Number' },
  { id: 2, title: 'Cách gia hạn Visa tại Nhật' },
  { id: 3, title: 'Thủ tục chuyển nhà (Tenshutsu/Tennyu)' },
];

export default function GuidesScreen() {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Cẩm nang cuộc sống</Text>
      {MOCK_BLOGS.map((blog) => (
        <View key={blog.id} style={styles.blogItem}>
          <Text style={styles.blogTitle}>{blog.title}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#FFF' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  blogItem: { padding: 20, backgroundColor: '#F9FAFB', borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#EEE' },
  blogTitle: { fontSize: 16, fontWeight: '500' },
});